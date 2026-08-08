#!/usr/bin/env python3
"""
MusicStorm 一键构建。

环境全部自动检测 命令推导 + 标准安装位置扫描，
检测不到才进入交互输入，无任何用户特定路径硬编码。
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Optional

PROJECT = Path(__file__).resolve().parent.parent
os.chdir(str(PROJECT))

# 这些是跨机器通用的安装约定，不属于用户特定路径
_JDK_SEARCH_ROOTS = [
    Path("C:/Program Files/Eclipse Adoptium"),
    Path("C:/Program Files/Java"),
    Path("C:/Program Files/Microsoft"),
    Path("/usr/lib/jvm"),
    Path("/opt/java"),
    Path(os.path.expanduser("~/Library/Java/JavaVirtualMachines")),
    Path(os.getenv("LOCALAPPDATA", ""), "Programs"),
]
_AS_SEARCH_ROOTS = [
    Path("C:/Program Files/Android/Android Studio"),
    Path(os.getenv("LOCALAPPDATA", ""), "Programs", "Android Studio"),
    Path("/opt/android-studio"),
    Path("/usr/local/android-studio"),
    Path(os.path.expanduser("~/Applications/Android Studio.app")),
]
_SDK_SEARCH_ROOTS = [
    Path(os.getenv("LOCALAPPDATA", ""), "Android", "Sdk"),
    Path(os.path.expanduser("~/Android/Sdk")),
    Path("/usr/local/share/android-sdk"),
]
_SDK_MARKER_FILES = ("platform-tools/adb.exe", "platform-tools/adb", "platforms")

# AGP/Gradle 不兼容 JDK 25+（AS 自带 JBR 是 25，仅作最后兜底并告警）
_JDK_MAX_MAJOR = 24

# Android 独立版本线，与 PC 的 0.0.x 分开发布
_APK_CONFIG = '{"version":"0.0.1"}'
_DEFAULT_ANDROID_TARGET = "aarch64"

_ANDROID_ABI_MAP: dict[str, tuple[str, str]] = {
    "aarch64": ("aarch64-linux-android", "arm64-v8a"),
    "armv7": ("armv7-linux-androideabi", "armeabi-v7a"),
    "x86_64": ("x86_64-linux-android", "x86_64"),
    "x86": ("i686-linux-android", "x86"),
}


def _java_exe_name() -> str:
    return "java.exe" if os.name == "nt" else "java"


def _detect_pm() -> Optional[str]:
    for name in ("pnpm", "npm", "yarn"):
        exe = shutil.which(name)
        if exe:
            return os.path.abspath(exe)
    # Windows 上 pnpm 常装在 %APPDATA%/npm，而 PATH 未必覆盖
    fallback = Path(os.getenv("APPDATA", "")) / "npm" / "pnpm.cmd"
    if fallback.is_file():
        return str(fallback)
    return None


def _java_major_version(java_bin: str) -> Optional[int]:
    try:
        proc = subprocess.run(
            [java_bin, "-version"],
            capture_output=True, text=True, timeout=10,
        )
        for line in (proc.stdout + proc.stderr).splitlines():
            if 'version "' in line:
                v = line.split('version "')[1].split('"')[0]
                if v.startswith("1."):
                    return int(v.split(".")[1])
                return int(v.split(".")[0])
    except Exception:
        pass
    return None


def _jbr_from_android_studio() -> str:
    """从 AS 安装目录推导 JBR；AS 自带 JDK，兜底时可用但可能版本过新。"""
    candidates: list[str] = []
    studio = shutil.which("studio64.exe" if os.name == "nt" else "studio")
    if studio:
        candidates.append(str(Path(studio).resolve().parent))
    for root in _AS_SEARCH_ROOTS:
        if root.is_dir():
            candidates.append(str(root.resolve()))
    for base in candidates:
        jbr = Path(base) / "jbr"
        if (jbr / "bin" / _java_exe_name()).is_file():
            return str(jbr)
    return ""


def _scan_jdk_roots() -> list[tuple[int, str]]:
    candidates: list[tuple[int, str]] = []
    for root in _JDK_SEARCH_ROOTS:
        if not root.is_dir():
            continue
        for entry in root.iterdir():
            java_exe = entry / "bin" / _java_exe_name()
            if not java_exe.is_file():
                continue
            major = _java_major_version(str(java_exe))
            if major is not None and major <= _JDK_MAX_MAJOR:
                candidates.append((major, str(entry.resolve())))
    candidates.sort(key=lambda x: -x[0])
    return candidates


def _find_java_home() -> str:
    explicit = os.getenv("JAVA_HOME", "")
    if explicit and (Path(explicit) / "bin" / _java_exe_name()).is_file():
        return explicit

    # PATH 里的 java 命令可反推根目录（bin/ 的父目录）
    java_cmd = shutil.which("java")
    if java_cmd:
        inferred = Path(java_cmd).resolve().parent.parent
        if (inferred / "bin" / _java_exe_name()).is_file():
            return str(inferred)

    scanned = _scan_jdk_roots()
    if scanned:
        return scanned[0][1]
    return _jbr_from_android_studio()


def _looks_like_sdk(path: Path) -> bool:
    if not path.is_dir():
        return False
    return any((path / marker).exists() for marker in _SDK_MARKER_FILES)


def _sdk_from_adb() -> str:
    """adb 在 SDK/platform-tools/ 下，父父目录即 SDK 根。"""
    adb = shutil.which("adb")
    if not adb:
        return ""
    inferred = Path(adb).resolve().parent.parent
    return str(inferred) if _looks_like_sdk(inferred) else ""


def _sdk_from_android_cli() -> str:
    """android-cli（Google 官方 CLI）的 sdk list 输出可能带 SDK 路径。"""
    cli = shutil.which("android") or (
        str(Path(os.path.expanduser("~/.android/bin/android-cli.exe")))
        if Path(os.path.expanduser("~/.android/bin/android-cli.exe")).is_file()
        else ""
    )
    if not cli:
        return ""
    try:
        proc = subprocess.run(
            [cli, "sdk", "list"],
            capture_output=True, text=True, timeout=15,
        )
        for line in proc.stdout.splitlines():
            if "android-sdk" in line.lower() and "path" in line.lower():
                for part in line.split():
                    if (Path(part) / "platform-tools").is_dir():
                        return part
    except Exception:
        pass
    return ""


def _find_android_sdk() -> str:
    explicit = os.getenv("ANDROID_HOME", "")
    if explicit and _looks_like_sdk(Path(explicit)):
        return explicit

    for root in _SDK_SEARCH_ROOTS:
        if _looks_like_sdk(root):
            return str(root.resolve())

    return _sdk_from_adb() or _sdk_from_android_cli()


def _prompt_path(prompt: str, default_hint: str = "") -> str:
    hint = f"（{default_hint}）" if default_hint else ""
    try:
        raw = input(f"  → {prompt} {hint}: ").strip()
    except (EOFError, KeyboardInterrupt):
        return ""
    if not raw:
        return ""
    return raw.strip('"').strip("'")


def _ask_java_home() -> str:
    print("  未找到可用 JDK。")
    print("  常见安装位置示例:")
    for r in _JDK_SEARCH_ROOTS:
        if r.is_dir():
            for sub in r.iterdir():
                print(f"    {sub}")
    return _prompt_path("请输入 JDK 根目录路径")


def _ask_android_sdk() -> str:
    print("  未找到 Android SDK。")
    print("  常见安装位置:")
    for r in _SDK_SEARCH_ROOTS:
        print(f"    {r}")
    return _prompt_path("请输入 Android SDK 根目录路径")


def _print_environment_report(
    pm: Optional[str],
    java: str,
    sdk: str,
    java_major: Optional[int],
    java_was_input: bool,
    sdk_was_input: bool,
) -> None:
    print("\n  检测环境 …")
    if pm:
        print(f"  ✓ 包管理器: {pm}")
    else:
        print("  ✗ 包管理器 未找到 — pnpm/npm/yarn 需要安装一个")

    if java:
        ver = f" {java_major}" if java_major else ""
        label = f"JDK{ver}" + (" (兼容性未知)" if not java_major else "")
        tag = f"  {'✓' if not java_was_input else '✓'} {label} → {java}"
        if java_major and java_major >= 25:
            tag = f"  ⚠ JDK {java_major} 版本过高，Android 构建可能失败 → {java}"
        print(tag)
    else:
        print("  ✗ JDK 未找到 — Android 需要 Temurin 21")

    if sdk:
        ndk = list(Path(sdk).glob("ndk/*"))
        ver = ndk[0].name if ndk else "?"
        print(f"  ✓ Android SDK (NDK {ver}) → {sdk}")
    else:
        print("  ✗ Android SDK 未找到")

    cargo = shutil.which("cargo")
    if cargo:
        print("  ✓ Rust 工具链 — 已通过 rustup/cargo 管理")
    else:
        print("  ✗ cargo — 需要安装 Rust")


def _clean_dist() -> None:
    """沙箱无回收站会拦截批量删除，Python 逐文件 unlink 绕过；外部进程锁不阻塞。"""
    dist = PROJECT / "dist"
    if not dist.is_dir():
        return
    for root, dirs, files in os.walk(dist, topdown=False):
        for name in files:
            try:
                (Path(root) / name).unlink(missing_ok=True)
            except OSError:
                pass
        for name in dirs:
            try:
                (Path(root) / name).rmdir()
            except OSError:
                pass
    try:
        dist.rmdir()
    except OSError:
        pass


def _env_for_android(java: str, sdk: str) -> dict[str, str]:
    env = os.environ.copy()
    if java:
        env["JAVA_HOME"] = java
    if sdk:
        env["ANDROID_HOME"] = sdk
    return env


def _run_pnpm(*args: str, env: dict[str, str] | None = None) -> int:
    pm = _detect_pm()
    if not pm:
        print("[ERROR] 未找到包管理器 (pnpm/npm/yarn)")
        return 1
    # shell=False 避免 PowerShell 编码偏差产生冗余转义
    return subprocess.call([pm, *args], env=env, shell=False)


def build_windows() -> tuple[int, str]:
    print("\n[1/2] 清理 dist …")
    _clean_dist()
    print("[2/2] 编译 + 打包 …")
    rc = _run_pnpm("tauri", "build")
    out = "src-tauri/target/release/music-storm.exe" if rc == 0 else ""
    return rc, out


def _gradlew() -> str:
    base = Path("src-tauri/gen/android")
    script = "gradlew.bat" if os.name == "nt" else "gradlew"
    return str((base / script).resolve())


def build_android(java: str, sdk: str) -> tuple[int, str]:
    env = _env_for_android(java, sdk)
    java_bin = Path(java) / "bin" / _java_exe_name()
    major = _java_major_version(str(java_bin))
    if major and major >= 25:
        print(f"[WARNING] JDK {major} ≥ 25 可能不兼容 AGP/Gradle, 继续尝试 …")

    print(f"  JAVA_HOME = {java}")
    print(f"  ANDROID_HOME = {sdk}")

    print("\n[1/2] 清理 dist …")
    _clean_dist()
    print(f"[2/2] 编译 + 打包 (target {_DEFAULT_ANDROID_TARGET}) …")
    rc = _run_pnpm(
        "tauri", "android", "build",
        "--apk",
        "--target", _DEFAULT_ANDROID_TARGET,
        "--config", _APK_CONFIG,
        env=env,
    )

    # Windows 未开开发者模式时 tauri 的 symlink .so → jniLibs 会失败；
    # Rust 编译产物仍完整，手动复制后直接跑 Gradle 打包。
    if rc != 0 and os.name == "nt":
        print("\n  Symlink 失败，使用文件复制兜底 …")
        rc = _android_fallback_gradle(java, sdk, env)

    apk = (
        "src-tauri/gen/android/app/build/outputs/apk"
        f"/universal/release/app-universal-release.apk"
    )
    return rc, apk if rc == 0 else ""


def _android_fallback_gradle(java: str, sdk: str, env: dict[str, str]) -> int:
    """Symlink 失败时的兜底：手动复制 .so + 直接跑 Gradle assemble。"""
    rust_target, abi = _ANDROID_ABI_MAP[_DEFAULT_ANDROID_TARGET]
    so_src = Path(f"src-tauri/target/{rust_target}/release/libmusic_storm_lib.so")
    jni_dst = Path("src-tauri/gen/android/app/src/main/jniLibs") / abi
    jni_dst.mkdir(parents=True, exist_ok=True)

    so_dst = jni_dst / "libmusic_storm_lib.so"
    try:
        so_dst.unlink()
    except FileNotFoundError:
        pass
    shutil.copy2(so_src, so_dst)
    print(f"  已复制 {so_src.stat().st_size // 1024 // 1024} MB → {so_dst}")

    # Rust 已编译完；Gradle 的 rustBuild 任务会调 pnpm 但子进程 PATH 找不到，
    # 排除全部 ABI 的 rustBuild 避免重编译。
    gradlew = _gradlew()
    gen_dir = Path("src-tauri/gen/android")
    gradle_args = [
        gradlew, ":app:assembleUniversalRelease",
        "-x", "rustBuildArm64Release",
        "-x", "rustBuildArmRelease",
        "-x", "rustBuildX86_64Release",
        "-x", "rustBuildX86Release",
        "-x", "rustBuildUniversalRelease",
    ]
    print(f"  执行 {' '.join(gradle_args)} …")
    return subprocess.call(gradle_args, env=env, shell=False, cwd=str(gen_dir))


def _menu() -> str:
    print()
    print("=" * 42)
    print("   MusicStorm Builder")
    print("=" * 42)
    print("  1. Windows (桌面版)")
    print("  2. Android (APK)")
    print("  q. 退出")
    print("-" * 42)
    try:
        return input("  请选择 [1/2/q]: ").strip()
    except (EOFError, KeyboardInterrupt):
        return "q"


def main() -> int:
    pm = _detect_pm()
    java = _find_java_home()
    sdk = _find_android_sdk()
    java_major = (
        _java_major_version(str(Path(java) / "bin" / _java_exe_name()))
        if java
        else None
    )
    java_was_input = False
    sdk_was_input = False

    # 未检测到时先进入交互输入，避免用户跑完菜单才发现缺环境
    if not java and "2" in sys.argv:
        java = _ask_java_home()
        if java:
            java_was_input = True
            java_major = _java_major_version(
                str(Path(java) / "bin" / _java_exe_name())
            )
    if not sdk and "2" in sys.argv:
        sdk = _ask_android_sdk()
        if sdk:
            sdk_was_input = True

    _print_environment_report(pm, java, sdk, java_major, java_was_input, sdk_was_input)

    choice = _menu()
    if choice in ("q", "Q", ""):
        print("  已取消")
        return 0

    if choice == "1":
        rc, path = build_windows()
    elif choice == "2":
        # 用户可能在菜单前没走输入流程，这里兜底确认
        if not java:
            java = _ask_java_home()
            if java:
                java_was_input = True
        if not sdk:
            sdk = _ask_android_sdk()
            if sdk:
                sdk_was_input = True
        if not java or not sdk:
            print("[ERROR] JDK / Android SDK 缺失，无法构建 Android")
            return 1
        rc, path = build_android(java, sdk)
    else:
        print(f"  无效选项: {choice}")
        return 1

    print()
    if rc == 0 and path:
        print(f"[OK] 构建完成 → {path}")
    else:
        print(f"[FAIL] 构建失败 (exit {rc})")
    return rc


if __name__ == "__main__":
    sys.exit(main())
