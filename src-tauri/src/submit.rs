//! Online submission transport — the native replacement for ebfSFTP.exe + WinSCP
//! (docs/analysis/native-layer.md §4), minus the original's security holes.
//!
//! The original hardcoded its SFTP credentials (decrypted from a passphrase baked into the binary),
//! accepted ANY SSH host key, and passed the password on a command line. Here every connection detail is
//! supplied by the caller (a settings screen or BIR's dispatcher), the host key is pinned trust-on-first-use
//! and refused if it ever changes, and the password lives only in memory for the duration of the upload.
//!
//! This module is transport only. It never reads secrets out of BIR's binaries.

use russh::client::{self, Config, Handler};
use russh::keys::{HashAlg, PublicKeyOrCertificate};
use russh::Disconnect;
use russh_sftp::client::SftpSession;
use std::collections::BTreeMap;
use std::sync::Arc;

/// Where a return is uploaded. All of this is caller-supplied; nothing is embedded.
#[derive(Clone, Debug)]
pub struct SubmitTarget {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
    /// Remote folder under the SFTP root, e.g. "1701v2018". Empty falls back to `form_code`.
    pub folder: String,
    pub form_code: String,
    /// Optional HTTP CONNECT proxy (host, port), mirroring BIR's proxy.ini support.
    pub proxy: Option<(String, u16)>,
}

impl SubmitTarget {
    fn remote_dir(&self) -> String {
        let folder = if self.folder.trim().is_empty() { &self.form_code } else { &self.folder };
        format!("/{}/", folder.trim_matches('/'))
    }
}

#[derive(Debug)]
pub enum SubmitError {
    HostKeyChanged { host: String, pinned: String, seen: String },
    Auth,
    Transport(String),
}

impl std::fmt::Display for SubmitError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SubmitError::HostKeyChanged { host, pinned, seen } => write!(
                f,
                "the SSH host key for {host} changed (pinned {pinned}, got {seen}). Refusing to upload — this could be an interception. Remove the pin only if you know the server was legitimately rekeyed."
            ),
            SubmitError::Auth => write!(f, "the server rejected the username or password."),
            SubmitError::Transport(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for SubmitError {}
impl From<russh::Error> for SubmitError {
    fn from(e: russh::Error) -> Self {
        SubmitError::Transport(e.to_string())
    }
}

/// A pinned host key per hostname (SHA-256 fingerprints, "SHA256:…"). Persisted by the caller.
pub type KnownHost = BTreeMap<String, String>;

struct PinHandler {
    host: String,
    pinned: Option<String>,
    /// Filled in with the fingerprint we actually saw, so the caller can store it on first use.
    seen: Arc<std::sync::Mutex<Option<String>>>,
}

impl PinHandler {
    fn verify(&self, fingerprint: String) -> Result<bool, SubmitError> {
        *self.seen.lock().unwrap() = Some(fingerprint.clone());
        match &self.pinned {
            None => Ok(true), // trust on first use; the caller records `seen`
            Some(p) if *p == fingerprint => Ok(true),
            Some(p) => Err(SubmitError::HostKeyChanged { host: self.host.clone(), pinned: p.clone(), seen: fingerprint }),
        }
    }
}

impl Handler for PinHandler {
    type Error = SubmitError;

    async fn check_server_key(&mut self, server_public_key: &PublicKeyOrCertificate) -> Result<bool, Self::Error> {
        self.verify(server_public_key.public_key().fingerprint(HashAlg::Sha256).to_string())
    }
}

/// The outcome of an upload attempt.
#[derive(Debug)]
pub struct Submitted {
    /// The host-key fingerprint seen; the caller pins it after a first successful upload.
    pub host_fingerprint: String,
    pub remote_path: String,
}

async fn connect_stream(target: &SubmitTarget, config: Arc<Config>, handler: PinHandler) -> Result<client::Handle<PinHandler>, SubmitError> {
    match &target.proxy {
        None => client::connect(config, (target.host.as_str(), target.port), handler).await,
        Some((proxy_host, proxy_port)) => {
            use tokio::io::{AsyncReadExt, AsyncWriteExt};
            let mut stream = tokio::net::TcpStream::connect((proxy_host.as_str(), *proxy_port))
                .await
                .map_err(|e| SubmitError::Transport(format!("proxy connect: {e}")))?;
            let req = format!("CONNECT {0}:{1} HTTP/1.1\r\nHost: {0}:{1}\r\n\r\n", target.host, target.port);
            stream.write_all(req.as_bytes()).await.map_err(|e| SubmitError::Transport(e.to_string()))?;
            let mut buf = [0u8; 1024];
            let n = stream.read(&mut buf).await.map_err(|e| SubmitError::Transport(e.to_string()))?;
            let head = String::from_utf8_lossy(&buf[..n]);
            if !head.starts_with("HTTP/1.1 200") && !head.starts_with("HTTP/1.0 200") {
                return Err(SubmitError::Transport(format!("proxy refused CONNECT: {}", head.lines().next().unwrap_or(""))));
            }
            client::connect_stream(config, stream, handler).await
        }
    }
}

/// Upload one already-encrypted return. Async; call from a Tokio runtime.
pub async fn upload(target: &SubmitTarget, remote_name: &str, data: &[u8], known: &KnownHost) -> Result<Submitted, SubmitError> {
    let seen = Arc::new(std::sync::Mutex::new(None));
    let handler = PinHandler {
        host: target.host.clone(),
        pinned: known.get(&target.host).cloned(),
        seen: seen.clone(),
    };
    let config = Arc::new(Config { ..Default::default() });
    let mut session = connect_stream(target, config, handler).await?;

    if !session.authenticate_password(&target.user, &target.password).await?.success() {
        let _ = session.disconnect(Disconnect::ByApplication, "", "en").await;
        return Err(SubmitError::Auth);
    }

    let channel = session.channel_open_session().await?;
    channel.request_subsystem(true, "sftp").await?;
    let sftp = SftpSession::new(channel.into_stream()).await.map_err(|e| SubmitError::Transport(e.to_string()))?;

    let dir = target.remote_dir();
    let _ = sftp.create_dir(dir.trim_end_matches('/')).await; // BIR pre-creates these; ignore "already exists"
    let remote_path = format!("{dir}{remote_name}");
    {
        use tokio::io::AsyncWriteExt;
        // create() opens CREATE|WRITE|TRUNCATE; plain write() opens WRITE only and fails on a new file
        let mut file = sftp.create(&remote_path).await.map_err(|e| SubmitError::Transport(format!("upload: {e}")))?;
        file.write_all(data).await.map_err(|e| SubmitError::Transport(format!("upload: {e}")))?;
        file.flush().await.map_err(|e| SubmitError::Transport(format!("upload: {e}")))?;
        file.shutdown().await.map_err(|e| SubmitError::Transport(format!("upload: {e}")))?;
    }
    let _ = sftp.close().await;
    let _ = session.disconnect(Disconnect::ByApplication, "", "en").await;
    drop(session); // release the handler's Arc clone before we read the recorded fingerprint

    let host_fingerprint = seen.lock().unwrap().clone().unwrap_or_default();
    Ok(Submitted { host_fingerprint, remote_path })
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn empty_folder_falls_back_to_the_form_code() {
        let base = SubmitTarget {
            host: "h".into(),
            port: 22,
            user: "u".into(),
            password: "p".into(),
            folder: String::new(),
            form_code: "1701v2018".into(),
            proxy: None,
        };
        assert_eq!(base.remote_dir(), "/1701v2018/");
        assert_eq!(SubmitTarget { folder: "UAT1/1701".into(), ..base }.remote_dir(), "/UAT1/1701/");
    }

    #[test]
    fn a_changed_host_key_is_refused() {
        let h = PinHandler { host: "bir".into(), pinned: Some("SHA256:aaa".into()), seen: Arc::new(std::sync::Mutex::new(None)) };
        assert!(matches!(h.verify("SHA256:bbb".into()), Err(SubmitError::HostKeyChanged { .. })));
        assert!(matches!(h.verify("SHA256:aaa".into()), Ok(true)));
    }

    #[test]
    fn first_use_is_trusted_and_recorded() {
        let seen = Arc::new(std::sync::Mutex::new(None));
        let h = PinHandler { host: "bir".into(), pinned: None, seen: seen.clone() };
        assert_eq!(h.verify("SHA256:ccc".into()).unwrap(), true);
        assert_eq!(seen.lock().unwrap().as_deref(), Some("SHA256:ccc"));
    }
}

/// Integration test against a real SFTP server. Start one first:
///   docker run -d --name ebf-sftp -p 127.0.0.1:10922:22 atmoz/sftp:alpine "bir:secret:::1701v2018"
/// then: EBIRFORMS_SFTP=127.0.0.1:10922 cargo test --manifest-path src-tauri/Cargo.toml -- --ignored sftp
#[cfg(test)]
mod integration {
    use super::*;

    fn target(port: u16) -> SubmitTarget {
        SubmitTarget {
            host: "127.0.0.1".into(),
            port,
            user: "bir".into(),
            password: "secret".into(),
            folder: "1701v2018".into(),
            form_code: "1701v2018".into(),
            proxy: None,
        }
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    #[ignore]
    async fn uploads_pins_and_then_refuses_a_changed_key() {
        let addr = std::env::var("EBIRFORMS_SFTP").expect("EBIRFORMS_SFTP=host:port");
        let port: u16 = addr.rsplit(':').next().unwrap().parse().unwrap();
        let t = target(port);
        let payload = b"<encrypted eBIRForms return>";

        // first upload: trust on first use, record the fingerprint
        let mut known = KnownHost::new();
        let done = upload(&t, "84653210700000-1701v2018-2026.xml", payload, &known).await.unwrap();
        assert!(done.host_fingerprint.starts_with("SHA256:"));
        assert_eq!(done.remote_path, "/1701v2018/84653210700000-1701v2018-2026.xml");
        known.insert(t.host.clone(), done.host_fingerprint.clone());

        // second upload with the correct pin: fine
        upload(&t, "second.xml", payload, &known).await.unwrap();

        // a tampered pin is refused — this is the whole point of pinning
        let mut tampered = KnownHost::new();
        tampered.insert(t.host.clone(), "SHA256:not-the-real-key".into());
        match upload(&t, "third.xml", payload, &tampered).await {
            Err(SubmitError::HostKeyChanged { .. }) => {}
            other => panic!("expected HostKeyChanged, got {other:?}"),
        }

        // wrong password is reported as an auth failure, not a generic error
        let bad = SubmitTarget { password: "wrong".into(), ..target(port) };
        assert!(matches!(upload(&bad, "x.xml", payload, &known).await, Err(SubmitError::Auth)));
    }
}
