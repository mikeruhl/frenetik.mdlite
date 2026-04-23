// ── Platform init (macOS needs AppHandle for dock menu callbacks) ──

#[cfg(target_os = "macos")]
pub(crate) fn init_platform(handle: &tauri::AppHandle) {
    dock::init(handle);
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn init_platform(_handle: &tauri::AppHandle) {}

// ── update_jump_list ──

#[cfg(target_os = "windows")]
pub(crate) fn update_jump_list(recent_files: &[String], recent_folders: &[String]) {
    if let Err(e) = win::build(recent_files, recent_folders) {
        eprintln!("Jump list update failed: {e}");
    }
}

#[cfg(target_os = "macos")]
pub(crate) fn update_jump_list(recent_files: &[String], recent_folders: &[String]) {
    dock::update_dock_menu(recent_files, recent_folders);
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
pub(crate) fn update_jump_list(_recent_files: &[String], _recent_folders: &[String]) {}

// ── notify_recent_doc ──

#[cfg(target_os = "windows")]
pub(crate) fn notify_recent_doc(path: &std::path::Path) {
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::UI::Shell::{SHAddToRecentDocs, SHARD_PATHW};

    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
    unsafe {
        SHAddToRecentDocs(SHARD_PATHW.0 as u32, Some(wide.as_ptr() as *const _));
    }
}

#[cfg(target_os = "macos")]
pub(crate) fn notify_recent_doc(path: &std::path::Path) {
    if let Some(s) = path.to_str() {
        dock::note_recent_document(s);
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
pub(crate) fn notify_recent_doc(_path: &std::path::Path) {}

// ── Windows implementation ──

#[cfg(target_os = "windows")]
mod win {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::path::Path;
    use windows::Win32::Foundation::PROPERTYKEY;
    use windows::Win32::System::Com::StructuredStorage::PROPVARIANT;
    use windows::Win32::System::Com::*;
    use windows::Win32::UI::Shell::Common::*;
    use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;
    use windows::Win32::UI::Shell::*;
    use windows_core::*;

    const PKEY_TITLE: PROPERTYKEY = PROPERTYKEY {
        fmtid: GUID {
            data1: 0xF29F85E0,
            data2: 0x4FF9,
            data3: 0x1068,
            data4: [0xAB, 0x91, 0x08, 0x00, 0x2B, 0x27, 0xB3, 0xD9],
        },
        pid: 2,
    };

    fn to_wide(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
    }

    pub(super) fn build(recent_files: &[String], recent_folders: &[String]) -> windows_core::Result<()> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

            let dest_list: ICustomDestinationList = CoCreateInstance(&DestinationList, None, CLSCTX_INPROC_SERVER)?;

            if recent_files.is_empty() && recent_folders.is_empty() {
                dest_list.DeleteList(PCWSTR::null())?;
                return Ok(());
            }

            let mut max_slots = 0u32;
            let _removed: windows_core::IUnknown = dest_list.BeginList(core::ptr::from_mut(&mut max_slots))?;

            struct AbortGuard<'a> {
                list: &'a ICustomDestinationList,
                committed: bool,
            }
            impl Drop for AbortGuard<'_> {
                fn drop(&mut self) {
                    if !self.committed {
                        unsafe {
                            let _ = self.list.AbortList();
                        }
                    }
                }
            }
            let mut guard = AbortGuard {
                list: &dest_list,
                committed: false,
            };

            let exe = std::env::current_exe().map_err(|e| Error::new(HRESULT(0x80004005u32 as i32), e.to_string()))?;
            let exe_wide = to_wide(&exe.to_string_lossy());

            if !recent_folders.is_empty() {
                let coll: IObjectCollection =
                    CoCreateInstance(&EnumerableObjectCollection, None, CLSCTX_INPROC_SERVER)?;

                for path_str in recent_folders {
                    let name = Path::new(path_str)
                        .file_name()
                        .map(|n| n.to_string_lossy())
                        .unwrap_or_else(|| path_str.as_str().into());

                    let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
                    link.SetPath(PCWSTR(exe_wide.as_ptr()))?;
                    let arg_wide = to_wide(&format!("\"{}\"", path_str));
                    link.SetArguments(PCWSTR(arg_wide.as_ptr()))?;

                    let store: IPropertyStore = link.cast()?;
                    let title = PROPVARIANT::from(name.as_ref());
                    store.SetValue(&PKEY_TITLE, &title)?;
                    store.Commit()?;

                    coll.AddObject(&link)?;
                }

                let array: IObjectArray = coll.cast()?;
                let label = to_wide("Recent Folders");
                if let Err(e) = dest_list.AppendCategory(PCWSTR(label.as_ptr()), &array) {
                    eprintln!("AppendCategory (folders) failed: {e}");
                }
            }

            if !recent_files.is_empty() {
                let coll: IObjectCollection =
                    CoCreateInstance(&EnumerableObjectCollection, None, CLSCTX_INPROC_SERVER)?;

                for path_str in recent_files {
                    let p = Path::new(path_str);
                    let fname = p.file_name().unwrap_or_default().to_string_lossy();
                    let display = match p.parent().and_then(|d| d.file_name()) {
                        Some(dir) => format!("{} — {}", fname, dir.to_string_lossy()),
                        None => fname.to_string(),
                    };

                    let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
                    link.SetPath(PCWSTR(exe_wide.as_ptr()))?;
                    let arg_wide = to_wide(&format!("\"{}\"", path_str));
                    link.SetArguments(PCWSTR(arg_wide.as_ptr()))?;

                    let store: IPropertyStore = link.cast()?;
                    let title = PROPVARIANT::from(display.as_str());
                    store.SetValue(&PKEY_TITLE, &title)?;
                    store.Commit()?;

                    coll.AddObject(&link)?;
                }

                let array: IObjectArray = coll.cast()?;
                let label = to_wide("Recent");
                if let Err(e) = dest_list.AppendCategory(PCWSTR(label.as_ptr()), &array) {
                    eprintln!("AppendCategory (files) failed: {e}");
                }
            }

            dest_list.CommitList()?;
            guard.committed = true;
            Ok(())
        }
    }
}

// ── macOS implementation ──

#[cfg(target_os = "macos")]
mod dock {
    use std::ffi::{c_char, c_void, CStr, CString};
    use std::path::PathBuf;
    use std::sync::OnceLock;

    type Id = *mut c_void;
    type Sel = *mut c_void;
    type Class = *mut c_void;

    struct SendPtr(Id);
    unsafe impl Send for SendPtr {}
    unsafe impl Sync for SendPtr {}

    #[link(name = "objc", kind = "dylib")]
    extern "C" {
        fn objc_getClass(name: *const c_char) -> Class;
        fn sel_registerName(name: *const c_char) -> Sel;
        fn objc_allocateClassPair(superclass: Class, name: *const c_char, extra_bytes: usize) -> Class;
        fn objc_registerClassPair(cls: Class);
        fn class_addMethod(cls: Class, sel: Sel, imp: *const c_void, types: *const c_char) -> bool;
    }

    extern "C" {
        #[link_name = "objc_msgSend"]
        fn msg0(obj: Id, sel: Sel) -> Id;
        #[link_name = "objc_msgSend"]
        fn msg1(obj: Id, sel: Sel, a1: Id) -> Id;
        #[link_name = "objc_msgSend"]
        fn msg1_cstr(obj: Id, sel: Sel, a1: *const c_char) -> Id;
        #[link_name = "objc_msgSend"]
        fn msg3(obj: Id, sel: Sel, a1: Id, a2: Sel, a3: Id) -> Id;
        #[link_name = "objc_msgSend"]
        fn msg_void1(obj: Id, sel: Sel, a1: Id);
        #[link_name = "objc_msgSend"]
        fn msg_void_bool(obj: Id, sel: Sel, a1: bool);
    }

    fn sel(name: &[u8]) -> Sel {
        unsafe { sel_registerName(name.as_ptr().cast()) }
    }

    fn cls(name: &[u8]) -> Id {
        unsafe { objc_getClass(name.as_ptr().cast()) as Id }
    }

    fn ns_string(s: &str) -> Id {
        let c = match CString::new(s) {
            Ok(c) => c,
            Err(_) => return std::ptr::null_mut(),
        };
        unsafe { msg1_cstr(cls(b"NSString\0"), sel(b"stringWithUTF8String:\0"), c.as_ptr()) }
    }

    static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();
    static HANDLER: OnceLock<SendPtr> = OnceLock::new();

    pub fn init(handle: &tauri::AppHandle) {
        APP_HANDLE.set(handle.clone()).ok();
        register_handler_class();
    }

    fn register_handler_class() {
        unsafe {
            let super_cls = objc_getClass(b"NSObject\0".as_ptr().cast());
            let new_cls = objc_allocateClassPair(super_cls, b"MdliteDockHandler\0".as_ptr().cast(), 0);
            if new_cls.is_null() {
                return;
            }

            class_addMethod(
                new_cls,
                sel(b"openFile:\0"),
                handle_open_file as *const c_void,
                b"v@:@\0".as_ptr().cast(),
            );
            class_addMethod(
                new_cls,
                sel(b"openFolder:\0"),
                handle_open_folder as *const c_void,
                b"v@:@\0".as_ptr().cast(),
            );

            objc_registerClassPair(new_cls);

            let alloc = msg0(new_cls as Id, sel(b"alloc\0"));
            let instance = msg0(alloc, sel(b"init\0"));
            HANDLER.set(SendPtr(instance)).ok();
        }
    }

    extern "C" fn handle_open_file(_this: Id, _sel: Sel, sender: Id) {
        open_item(sender, false);
    }

    extern "C" fn handle_open_folder(_this: Id, _sel: Sel, sender: Id) {
        open_item(sender, true);
    }

    fn open_item(sender: Id, is_folder: bool) {
        unsafe {
            let rep = msg0(sender, sel(b"representedObject\0"));
            if rep.is_null() {
                return;
            }
            let utf8 = msg0(rep, sel(b"UTF8String\0")) as *const c_char;
            if utf8.is_null() {
                return;
            }
            let path_str = match CStr::from_ptr(utf8).to_str() {
                Ok(s) => s.to_string(),
                Err(_) => return,
            };

            if let Some(handle) = APP_HANDLE.get() {
                if is_folder {
                    crate::switch_to_folder(handle, PathBuf::from(&path_str));
                } else {
                    crate::switch_file(handle, &path_str);
                }
            }
        }
    }

    pub fn update_dock_menu(recent_files: &[String], recent_folders: &[String]) {
        let handler = match HANDLER.get() {
            Some(h) => h.0,
            None => return,
        };

        unsafe {
            let pool = msg0(msg0(cls(b"NSAutoreleasePool\0"), sel(b"alloc\0")), sel(b"init\0"));

            let menu = msg0(msg0(cls(b"NSMenu\0"), sel(b"alloc\0")), sel(b"init\0"));
            msg0(menu, sel(b"autorelease\0"));

            if !recent_folders.is_empty() {
                add_header(menu, "Recent Folders");
                for path_str in recent_folders {
                    let name = std::path::Path::new(path_str)
                        .file_name()
                        .map(|n| n.to_string_lossy())
                        .unwrap_or_else(|| path_str.as_str().into());
                    add_item(menu, &name, path_str, handler, b"openFolder:\0");
                }
            }

            if !recent_folders.is_empty() && !recent_files.is_empty() {
                let sep = msg0(cls(b"NSMenuItem\0"), sel(b"separatorItem\0"));
                msg_void1(menu, sel(b"addItem:\0"), sep);
            }

            if !recent_files.is_empty() {
                add_header(menu, "Recent");
                for path_str in recent_files {
                    let p = std::path::Path::new(path_str);
                    let fname = p.file_name().unwrap_or_default().to_string_lossy();
                    let display = match p.parent().and_then(|d| d.file_name()) {
                        Some(dir) => format!("{} — {}", fname, dir.to_string_lossy()),
                        None => fname.to_string(),
                    };
                    add_item(menu, &display, path_str, handler, b"openFile:\0");
                }
            }

            let app = msg0(cls(b"NSApplication\0"), sel(b"sharedApplication\0"));
            msg_void1(app, sel(b"setDockMenu:\0"), menu);

            msg0(pool, sel(b"drain\0"));
        }
    }

    unsafe fn add_header(menu: Id, title: &str) {
        let alloc = msg0(cls(b"NSMenuItem\0"), sel(b"alloc\0"));
        let item = msg3(
            alloc,
            sel(b"initWithTitle:action:keyEquivalent:\0"),
            ns_string(title),
            std::ptr::null_mut(),
            ns_string(""),
        );
        msg_void_bool(item, sel(b"setEnabled:\0"), false);
        msg0(item, sel(b"autorelease\0"));
        msg_void1(menu, sel(b"addItem:\0"), item);
    }

    unsafe fn add_item(menu: Id, title: &str, path: &str, target: Id, action: &[u8]) {
        let alloc = msg0(cls(b"NSMenuItem\0"), sel(b"alloc\0"));
        let item = msg3(
            alloc,
            sel(b"initWithTitle:action:keyEquivalent:\0"),
            ns_string(title),
            sel(action),
            ns_string(""),
        );
        msg_void1(item, sel(b"setTarget:\0"), target);
        msg_void1(item, sel(b"setRepresentedObject:\0"), ns_string(path));
        msg0(item, sel(b"autorelease\0"));
        msg_void1(menu, sel(b"addItem:\0"), item);
    }

    pub fn note_recent_document(path: &str) {
        let path_c = match CString::new(path) {
            Ok(s) => s,
            Err(_) => return,
        };
        unsafe {
            let ns_path = msg1_cstr(cls(b"NSString\0"), sel(b"stringWithUTF8String:\0"), path_c.as_ptr());
            if ns_path.is_null() {
                return;
            }

            let url = msg1(cls(b"NSURL\0"), sel(b"fileURLWithPath:\0"), ns_path);
            if url.is_null() {
                return;
            }

            let controller = msg0(cls(b"NSDocumentController\0"), sel(b"sharedDocumentController\0"));
            if controller.is_null() {
                return;
            }

            msg_void1(controller, sel(b"noteNewRecentDocumentURL:\0"), url);
        }
    }
}
