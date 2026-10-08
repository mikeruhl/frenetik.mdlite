; Registers the install directory on the per-user PATH so agents and terminals can run `mdlite` by name.
; The registry value is rewritten as REG_EXPAND_SZ so existing %VAR% entries keep expanding.

!macro MDLITE_EDIT_USER_PATH ACTION
  System::Call 'Kernel32::SetEnvironmentVariable(t "MDLITE_INSTDIR", t "$INSTDIR")i'
  System::Call 'Kernel32::SetEnvironmentVariable(t "MDLITE_PATH_ACTION", t "${ACTION}")i'
  nsExec::Exec `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$$d = $$env:MDLITE_INSTDIR.TrimEnd('\'); $$k = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment'); $$p = [string]$$k.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames); $$all = @($$p -split ';' | Where-Object { $$_ }); $$keep = @($$all | Where-Object { $$_.TrimEnd('\') -ne $$d }); if ($$env:MDLITE_PATH_ACTION -eq 'add') { if ($$keep.Count -lt $$all.Count) { exit 0 }; $$keep += $$d } elseif ($$keep.Count -eq $$all.Count) { exit 0 }; $$k.SetValue('Path', ($$keep -join ';'), [Microsoft.Win32.RegistryValueKind]::ExpandString)"`
  Pop $0
  SendMessage 0xFFFF 0x001A 0 "STR:Environment" /TIMEOUT=5000
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro MDLITE_EDIT_USER_PATH "add"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro MDLITE_EDIT_USER_PATH "remove"
!macroend
