//! Headless packaged host for the WebKit playtests: `cargo run --example host -- <dist> <original> <data> [port]`.
//! Prints `listening <port>` once bound, then serves until killed.
fn main() {
    let a: Vec<String> = std::env::args().collect();
    if a.len() < 4 {
        eprintln!("usage: host <dist> <original> <data> [port]");
        std::process::exit(2);
    }
    let port = a.get(4).and_then(|p| p.parse().ok()).unwrap_or(0);
    let bound = ebirforms_lib::serve_headless(a[1].clone().into(), a[2].clone().into(), a[3].clone().into(), port).expect("bind");
    println!("listening {bound}");
    loop {
        std::thread::park();
    }
}
