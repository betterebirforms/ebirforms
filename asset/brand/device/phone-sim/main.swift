// A bare iOS web view for asset/brand/device/phone-sim.mjs: opens PF_URL, runs PF_JS once the page has settled, shows nothing
// of its own. Used only to photograph the site inside the iPhone simulator without Safari's address bar. Never shipped:
// the pictures are of the web version.
import UIKit
import WebKit

final class App: UIResponder, UIApplicationDelegate, WKNavigationDelegate {
  var window: UIWindow?
  let env = ProcessInfo.processInfo.environment

  func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    let config = WKWebViewConfiguration()
    config.websiteDataStore = .nonPersistent()
    let web = WKWebView(frame: .zero, configuration: config)
    web.navigationDelegate = self
    web.isOpaque = false
    web.backgroundColor = .white
    web.translatesAutoresizingMaskIntoConstraints = false
    let screen = UIViewController()
    screen.view.backgroundColor = .white
    screen.view.addSubview(web)
    NSLayoutConstraint.activate([
      web.topAnchor.constraint(equalTo: screen.view.safeAreaLayoutGuide.topAnchor),
      web.leadingAnchor.constraint(equalTo: screen.view.leadingAnchor),
      web.trailingAnchor.constraint(equalTo: screen.view.trailingAnchor),
      web.bottomAnchor.constraint(equalTo: screen.view.bottomAnchor),
    ])
    window = UIWindow(frame: UIScreen.main.bounds)
    window?.rootViewController = screen
    window?.makeKeyAndVisible()
    web.load(URLRequest(url: URL(string: env["PF_URL"] ?? "about:blank")!))
    return true
  }

  func webView(_ web: WKWebView, didFinish navigation: WKNavigation!) {
    guard let script = env["PF_JS"], !script.isEmpty else { return }
    DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) { web.evaluateJavaScript(script, completionHandler: nil) }
  }
}

UIApplicationMain(CommandLine.argc, CommandLine.unsafeArgv, nil, NSStringFromClass(App.self))
