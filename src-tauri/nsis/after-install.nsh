; NSIS 安装钩子：安装完成后自动运行新版本。
; 用于应用内自动更新（静默安装 /S 后免手动启动），手动安装时同样生效。
!macro NSIS_HOOK_POSTINSTALL
  Exec '"$INSTDIR\MusicStorm.exe"'
!macroend
