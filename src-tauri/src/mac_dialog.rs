//! macOS: BIR's `alert()`, `confirm()` and `prompt()` as native dialogs.
//!
//! WKWebView shows a JavaScript dialog only if its UI delegate implements the matching panel method. wry 0.57's
//! delegate (`WryWebViewUIDelegate`) implements the file and media panels but none of the JavaScript ones, so in the
//! Mac app `alert()` did nothing and `confirm()` returned false at once (measured: `confirm=false` in 1 ms). BIR's
//! Submit / Final Copy opens with `confirm("... Are you sure you want to submit?")`, so it silently stopped
//! (issue #1), and every validation error and "saved successfully" message was hidden.
//!
//! The fix adds the three panel methods to wry's delegate class at runtime, then re-attaches each webview's delegate
//! so WebKit, which caches which methods a delegate answers when it is set, sees them. Windows (WebView2) and Linux
//! (WebKitGTK) show these dialogs on their own.

use block2::Block;
use objc2::ffi::class_addMethod;
use objc2::runtime::{AnyClass, AnyObject, Bool, Imp, Sel};
use objc2::{msg_send, sel};
use objc2_foundation::NSString;

/// The title above every dialog: IE said "Message from webpage"; the app's name reads better.
const TITLE: &str = "eBIRForms";
/// NSAlertFirstButtonReturn.
const FIRST_BUTTON: isize = 1000;

unsafe fn alert(message: &NSString, buttons: &[&str], input: Option<&NSString>) -> (isize, Option<*mut AnyObject>) {
    let alert: *mut AnyObject = msg_send![objc2::class!(NSAlert), new];
    let _: () = msg_send![alert, setMessageText: &*NSString::from_str(TITLE)];
    let _: () = msg_send![alert, setInformativeText: message];
    for b in buttons {
        let _: *mut AnyObject = msg_send![alert, addButtonWithTitle: &*NSString::from_str(b)];
    }
    let field = input.map(|text| {
        let frame = objc2_foundation::NSRect::new(objc2_foundation::NSPoint::new(0.0, 0.0), objc2_foundation::NSSize::new(300.0, 24.0));
        let field: *mut AnyObject = msg_send![objc2::class!(NSTextField), alloc];
        let field: *mut AnyObject = msg_send![field, initWithFrame: frame];
        let _: () = msg_send![field, setStringValue: text];
        let _: () = msg_send![alert, setAccessoryView: field];
        field
    });
    let window: *mut AnyObject = msg_send![alert, window];
    if let Some(f) = field {
        let _: Bool = msg_send![window, makeFirstResponder: f];
    }
    let answer: isize = msg_send![alert, runModal];
    (answer, field)
}

extern "C" fn run_alert(_this: *mut AnyObject, _cmd: Sel, _view: *mut AnyObject, message: &NSString, _frame: *mut AnyObject, done: &Block<dyn Fn()>) {
    unsafe { alert(message, &["OK"], None) };
    done.call(());
}

extern "C" fn run_confirm(_this: *mut AnyObject, _cmd: Sel, _view: *mut AnyObject, message: &NSString, _frame: *mut AnyObject, done: &Block<dyn Fn(Bool)>) {
    let (answer, _) = unsafe { alert(message, &["OK", "Cancel"], None) };
    done.call((Bool::new(answer == FIRST_BUTTON),));
}

extern "C" fn run_prompt(
    _this: *mut AnyObject,
    _cmd: Sel,
    _view: *mut AnyObject,
    prompt: &NSString,
    default: *mut NSString,
    _frame: *mut AnyObject,
    done: &Block<dyn Fn(*mut NSString)>,
) {
    let empty = NSString::from_str("");
    let text = if default.is_null() { &*empty } else { unsafe { &*default } };
    let (answer, field) = unsafe { alert(prompt, &["OK", "Cancel"], Some(text)) };
    let value: *mut NSString = match (answer == FIRST_BUTTON, field) {
        (true, Some(f)) => unsafe { msg_send![f, stringValue] },
        _ => std::ptr::null_mut(),
    };
    done.call((value,));
}

/// Adds the panel methods to wry's delegate class (once; `class_addMethod` refuses a method that is already there),
/// then re-attaches `webview`'s delegate. Call after the webview exists: wry registers its class on first use.
pub fn install(webview: &tauri::Webview) -> tauri::Result<()> {
    webview.with_webview(|w| unsafe {
        let view = w.inner() as *mut AnyObject;
        let delegate: *mut AnyObject = msg_send![view, UIDelegate];
        if delegate.is_null() {
            return;
        }
        let class: *const AnyClass = msg_send![delegate, class];
        let class = class as *mut AnyClass;
        let add = |name: Sel, imp: Imp, types: &std::ffi::CStr| {
            class_addMethod(class, name, imp, types.as_ptr());
        };
        add(
            sel!(webView:runJavaScriptAlertPanelWithMessage:initiatedByFrame:completionHandler:),
            std::mem::transmute::<*const (), Imp>(run_alert as *const ()),
            c"v@:@@@@?",
        );
        add(
            sel!(webView:runJavaScriptConfirmPanelWithMessage:initiatedByFrame:completionHandler:),
            std::mem::transmute::<*const (), Imp>(run_confirm as *const ()),
            c"v@:@@@@?",
        );
        add(
            sel!(webView:runJavaScriptTextInputPanelWithPrompt:defaultText:initiatedByFrame:completionHandler:),
            std::mem::transmute::<*const (), Imp>(run_prompt as *const ()),
            c"v@:@@@@@?",
        );
        // WebKit records which methods the delegate answers when it is set: set it again so it sees the new ones
        let _: () = msg_send![view, setUIDelegate: std::ptr::null_mut::<AnyObject>()];
        let _: () = msg_send![view, setUIDelegate: delegate];
    })
}
