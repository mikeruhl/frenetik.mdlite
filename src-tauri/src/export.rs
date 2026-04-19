#[cfg(target_os = "windows")]
use std::os::windows::ffi::OsStrExt;
#[cfg(target_os = "windows")]
use std::sync::mpsc;

use std::sync::Mutex;
#[cfg(target_os = "windows")]
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

use crate::AppState;

fn pdf_filename(app: &tauri::AppHandle) -> String {
    let state = app.state::<Mutex<AppState>>();
    let s = state.lock().unwrap();
    let stem = s.file_path.file_stem().unwrap_or_default().to_string_lossy();
    if stem.is_empty() {
        "document.pdf".to_string()
    } else {
        format!("{}.pdf", stem)
    }
}

pub(crate) fn show_export_dialog(app: &tauri::AppHandle) {
    let filename = pdf_filename(app);
    let handle = app.clone();
    app.dialog()
        .file()
        .add_filter("PDF", &["pdf"])
        .set_file_name(&filename)
        .save_file(move |path| {
            if let Some(fp) = path {
                if let Ok(p) = fp.into_path() {
                    do_export(&handle, &p);
                }
            }
        });
}

#[cfg(target_os = "windows")]
fn do_export(app: &tauri::AppHandle, path: &std::path::Path) {
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use windows_core::Interface;

    let Some(window) = app.get_webview_window("main") else {
        let _ = app.emit("export-pdf-error", "Main window not found");
        return;
    };

    let path_wide: Vec<u16> = path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();

    let (tx, rx) = mpsc::channel();
    let app_clone = app.clone();

    let app_err = app_clone.clone();
    let result = window.with_webview(move |webview| unsafe {
        let controller = webview.controller();
        let tx_err = tx.clone();

        let core: ICoreWebView2 = match controller.CoreWebView2() {
            Ok(core) => core,
            Err(e) => {
                let _ = app_err.emit("export-pdf-error", format!("{}", e));
                let _ = tx_err.send(false);
                return;
            }
        };

        let core7: ICoreWebView2_7 = match core.cast() {
            Ok(c) => c,
            Err(_) => {
                let _ = app_err.emit("export-pdf-error", "PDF export requires a newer WebView2 runtime");
                let _ = tx_err.send(false);
                return;
            }
        };
        let handler: ICoreWebView2PrintToPdfCompletedHandler = PdfHandler { tx }.into();
        if core7
            .PrintToPdf(windows_core::PCWSTR(path_wide.as_ptr()), None, Some(&handler))
            .is_err()
        {
            let _ = tx_err.send(false);
        }
    });

    if let Err(e) = result {
        let _ = app_clone.emit("export-pdf-error", format!("{}", e));
        return;
    }

    std::thread::spawn(move || match rx.recv_timeout(std::time::Duration::from_secs(30)) {
        Ok(true) => {
            let _ = app_clone.emit("export-pdf-done", ());
        }
        Ok(false) => {
            let _ = app_clone.emit("export-pdf-error", "PDF export failed");
        }
        Err(_) => {
            let _ = app_clone.emit("export-pdf-error", "PDF export timed out");
        }
    });
}

#[cfg(not(target_os = "windows"))]
fn do_export(_app: &tauri::AppHandle, _path: &std::path::Path) {}

#[cfg(target_os = "windows")]
#[windows_implement::implement(webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2PrintToPdfCompletedHandler)]
struct PdfHandler {
    tx: mpsc::Sender<bool>,
}

#[cfg(target_os = "windows")]
impl webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2PrintToPdfCompletedHandler_Impl for PdfHandler_Impl {
    fn Invoke(&self, _error_code: windows_core::HRESULT, is_success: windows_core::BOOL) -> windows_core::Result<()> {
        let _ = self.tx.send(is_success.as_bool());
        Ok(())
    }
}

#[tauri::command]
pub(crate) fn export_pdf(#[cfg_attr(not(target_os = "windows"), allow(unused))] app: tauri::AppHandle) {
    #[cfg(target_os = "windows")]
    show_export_dialog(&app);
}
