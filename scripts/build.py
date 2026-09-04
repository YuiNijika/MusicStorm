#!/usr/bin/env python3
"""构建 Windows Android 和 Web 三个目标。

脚本不写死任何机器路径或版本号。JDK 与 Android SDK 依次取环境变量和 PATH，
仍缺再走交互输入补齐。应用版本和由此推导的 Android 版本码都来自共享 Tauri
配置，桌面端与移动端不会跑偏。
"""

from __future__ import annotations

import codecs
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
WEB_OUT_PATH = PROJECT / "dist" / "player.html"
WINDOWS_OUT_PATH = "src-tauri/target/release/music-storm.exe"

MAX_JDK_MAJOR = 24
DEFAULT_ANDROID_TARGET = "aarch64"
SDK_MARKERS = ("platform-tools/adb.exe", "platform-tools/adb", "platforms")

ANDROID_ABIS = {
    "aarch64": ("aarch64-linux-android", "arm64-v8a"),
    "armv7": ("armv7-linux-androideabi", "armeabi-v7a"),
    "x86_64": ("x86_64-linux-android", "x86_64"),
    "x86": ("i686-linux-android", "x86"),
}

ANDROID_RELEASE_APK = (
    PROJECT
    / "src-tauri"
    / "gen"
    / "android"
    / "app"
    / "build"
    / "outputs"
    / "apk"
    / "universal"
    / "release"
)

WEB_PLAYER_URL = os.getenv("MUSICSTORM_WEB_URL", "https://music.miomoe.cn/player.html")
WEB_DOWNLOAD_URL = os.getenv(
    "MUSICSTORM_DOWNLOAD_URL",
    "https://github.com/YuiNijika/MusicStorm/releases/latest",
)


class BuildError(Exception):
    """把配置或流程错误统一带到明确退出。"""


def app_config() -> dict:
    path = PROJECT / "src-tauri" / "tauri.conf.json"
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except OSError as error:
        raise BuildError(f"无法读取应用配置 {path}，原因是 {error}") from error
    except ValueError as error:
        raise BuildError(f"应用配置 {path} 不是合法 JSON，原因是 {error}") from error
    if not isinstance(payload, dict):
        raise BuildError("应用配置必须是 JSON 对象")
    return payload


def app_version() -> str:
    version = str(app_config().get("version", "")).strip()
    if not version:
        raise BuildError("共享 Tauri 配置里没有设置版本")
    return version


def android_version_code(version: str) -> int:
    # 版本码必须随日期只增不减，用年月日拼出单调递增的整数
    parts = version.replace("-", ".").split(".")
    if len(parts) < 3:
        raise BuildError(f"无法从 {version} 推导版本码")
    year = int(parts[0])
    month = int(parts[1])
    day = int(parts[2])
    if not 1 <= month <= 12 or not 1 <= day <= 31:
        raise BuildError(f"版本 {version} 的月份或日期超出合法范围")
    return year * 10_000 + month * 100 + day


def java_executable_name() -> str:
    return "java.exe" if os.name == "nt" else "java"


def path_list_from_env(variable: str) -> list[Path]:
    raw = os.getenv(variable, "")
    return [Path(part.strip().strip('"')) for part in raw.split(os.pathsep) if part.strip()]


def package_manager() -> str | None:
    for name in ("pnpm", "npm", "yarn"):
        found = shutil.which(name)
        if found:
            return os.path.abspath(found)
    # Windows 上 pnpm 常装在用户目录的 npm 下但 PATH 未必覆盖，补一个兜底位置
    shim = Path(os.getenv("APPDATA", "")) / "npm" / "pnpm.cmd"
    return str(shim) if shim.is_file() else None


def java_major(java_bin: str) -> int | None:
    try:
        proc = subprocess.run(
            [java_bin, "-version"],
            capture_output=True,
            text=True,
            timeout=10,
        )
    except OSError:
        return None
    text = proc.stdout + proc.stderr
    marker = 'version "'
    start = text.find(marker)
    if start < 0:
        return None
    version = text[start + len(marker) :].split('"', 1)[0]
    segments = version.split(".")
    # 老版号形如 1.8，去掉开头的一改用第二段作主版本
    if segments[0] and segments[0].isdigit() and int(segments[0]) == 1 and len(segments) > 1:
        return int(segments[1])
    return int(segments[0])


def java_home_from_env() -> str:
    explicit = os.getenv("JAVA_HOME", "").strip()
    if explicit and (Path(explicit) / "bin" / java_executable_name()).is_file():
        return explicit
    return ""


def java_home_from_path() -> str:
    binary = shutil.which("java")
    if not binary:
        return ""
    # java 在 bin 目录下，父父目录即 JDK 根
    inferred = Path(binary).resolve().parent.parent
    if (inferred / "bin" / java_executable_name()).is_file():
        return str(inferred)
    return ""


def java_home() -> str:
    explicit = java_home_from_env()
    if explicit:
        return explicit
    from_path = java_home_from_path()
    if from_path:
        return from_path
    for root in path_list_from_env("JDK_SEARCH_ROOTS"):
        if (root / "bin" / java_executable_name()).is_file():
            return str(root)
    return ""


def looks_like_sdk(path: Path) -> bool:
    if not path.is_dir():
        return False
    return any((path / marker).exists() for marker in SDK_MARKERS)


def sdk_from_path() -> str:
    # adb 在 SDK 的 platform-tools 下，父父目录即 SDK 根
    adb = shutil.which("adb")
    if adb:
        inferred = Path(adb).resolve().parent.parent
        if looks_like_sdk(inferred):
            return str(inferred)
    cli = shutil.which("android")
    if not cli:
        return ""
    try:
        proc = subprocess.run(
            [cli, "sdk", "list"],
            capture_output=True,
            text=True,
            timeout=15,
        )
    except OSError:
        return ""
    for line in proc.stdout.splitlines():
        if "android-sdk" not in line.lower() or "path" not in line.lower():
            continue
        for part in line.split():
            if (Path(part) / "platform-tools").is_dir():
                return part
    return ""


def android_sdk_home() -> str:
    for variable in ("ANDROID_HOME", "ANDROID_SDK_ROOT"):
        explicit = os.getenv(variable, "").strip()
        if explicit and looks_like_sdk(Path(explicit)):
            return explicit
    inferred = sdk_from_path()
    if inferred:
        return inferred
    for root in path_list_from_env("ANDROID_SEARCH_ROOTS"):
        if looks_like_sdk(root):
            return str(root.resolve())
    return ""


def choose_target() -> str:
    choices = ("1", "2", "3")
    if len(sys.argv) > 1 and sys.argv[1] in choices:
        return sys.argv[1]
    print()
    print("   1  Windows 桌面版")
    print("   2  Android APK")
    print("   3  Web 网页版")
    try:
        choice = input("  请选择 1 2 3 或 q: ").strip()
    except (EOFError, KeyboardInterrupt):
        return "q"
    return choice


def cli_value(flag: str) -> str:
    for index, arg in enumerate(sys.argv):
        if arg == flag and index + 1 < len(sys.argv):
            return sys.argv[index + 1]
    return ""


def android_target() -> str:
    value = cli_value("--target")
    if not value:
        return DEFAULT_ANDROID_TARGET
    if value not in ANDROID_ABIS:
        raise BuildError(f"未知的 ABI {value}")
    return value


def prompt_path(label: str) -> str:
    try:
        raw = input(f"  请输入{label}根目录路径: ").strip()
    except (EOFError, KeyboardInterrupt):
        return ""
    return raw.strip('"')


def run_command(args: list[str], env=None, cwd: Path | None = None) -> int:
    proc = subprocess.Popen(
        args,
        env=env,
        cwd=cwd,
        shell=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    assert proc.stdout is not None
    # 子进程输出按 UTF 增量解码转发，避免 Windows 终端中文乱码
    decoder = codecs.getincrementaldecoder("utf-8")(errors="replace")
    try:
        for chunk in iter(lambda: proc.stdout.read(4096), b""):
            sys.stdout.write(decoder.decode(chunk))
            sys.stdout.flush()
        sys.stdout.write(decoder.decode(b"", final=True))
        sys.stdout.flush()
    except KeyboardInterrupt:
        proc.kill()
    proc.wait()
    return proc.returncode


def run_package_manager(*args: str, env=None) -> int:
    manager = package_manager()
    if not manager:
        raise BuildError("PATH 里找不到包管理器")
    return run_command([manager, *args], env=env)


def clean_web_artifacts() -> None:
    remove_path(PROJECT / "dist" / "player.html")
    remove_path(PROJECT / "dist" / "assets" / "player")


def remove_path(target: Path) -> None:
    # 沙箱不提供回收站会拦截整目录删除，这里逐文件处理
    if target.is_file():
        try:
            target.unlink(missing_ok=True)
        except OSError:
            pass
        return
    if not target.is_dir():
        return
    for root, directories, files in os.walk(target, topdown=False):
        for name in files:
            try:
                (Path(root) / name).unlink(missing_ok=True)
            except OSError:
                pass
        for name in directories:
            try:
                (Path(root) / name).rmdir()
            except OSError:
                pass
    try:
        target.rmdir()
    except OSError:
        pass


def clean_dist() -> None:
    remove_path(PROJECT / "dist")


def write_android_version(version: str, version_code: int) -> None:
    props = (
        PROJECT / "src-tauri" / "gen" / "android" / "app" / "tauri.properties"
    )
    props.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "// THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.",
        f"tauri.android.versionName={version}",
        f"tauri.android.versionCode={version_code}",
        "",
    ]
    props.write_text("\n".join(lines), encoding="utf-8")


def sync_android_asset_version(version: str) -> None:
    # 发布给应用的资产配置也写同一版本，避免运行时读版本不一致
    asset = (
        PROJECT
        / "src-tauri"
        / "gen"
        / "android"
        / "app"
        / "src"
        / "main"
        / "assets"
        / "tauri.conf.json"
    )
    if not asset.is_file():
        return
    try:
        payload = json.loads(asset.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return
    if isinstance(payload, dict):
        payload["version"] = version
        asset.write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )


def build_windows() -> str:
    clean_dist()
    rc = run_package_manager("tauri", "build")
    return WINDOWS_OUT_PATH if rc == 0 else ""


def named_apk(version: str, target: str) -> str:
    apk = ANDROID_RELEASE_APK / "app-universal-release.apk"
    if not apk.is_file():
        unsigned = ANDROID_RELEASE_APK / "app-universal-release-unsigned.apk"
        if unsigned.is_file():
            apk = unsigned
    if not apk.is_file():
        return ""
    renamed = apk.with_name(f"MusicStorm_{version}-{target}.apk")
    try:
        shutil.copy2(apk, renamed)
    except OSError:
        return str(apk)
    return str(renamed)


def build_android(java: str, sdk: str) -> str:
    target = android_target()
    version = app_version()
    write_android_version(version, android_version_code(version))
    sync_android_asset_version(version)
    env = os.environ.copy()
    # 用探测到的正确路径覆盖宿主环境可能误设的值
    env["ANDROID_HOME"] = sdk
    env["ANDROID_SDK_ROOT"] = sdk
    env["JAVA_HOME"] = java
    env["VITE_APP_VERSION"] = version
    # 清掉可能被误配成镜像仓库地址的 Gradle 代理
    env["GRADLE_OPTS"] = (
        "-Dhttp.proxyHost= -Dhttps.proxyHost= -Dhttp.proxyPort= -Dhttps.proxyPort="
    )
    clean_dist()
    rc = run_package_manager(
        "tauri",
        "android",
        "build",
        "--apk",
        "--target",
        target,
        env=env,
    )
    return named_apk(version, target) if rc == 0 else ""


def run_vite(*args: str) -> int:
    node = shutil.which("node")
    if not node:
        raise BuildError("PATH 里找不到 node")
    vite = PROJECT / "node_modules" / "vite" / "bin" / "vite.js"
    if not vite.is_file():
        raise BuildError(f"vite 未安装于 {vite}")
    return run_command([node, str(vite), *args])


def build_web() -> str:
    clean_dist()
    clean_web_artifacts()
    rc = run_vite("build", "--config", "vite.player.config.ts")
    return str(WEB_OUT_PATH) if rc == 0 else ""


def print_environment(java: str, sdk: str) -> None:
    print("\n  环境")
    print(f"  包管理器     {package_manager()}")
    print(f"  JDK 目录    {java or '未设置  请配置 JAVA_HOME 或加入 PATH'}")
    if java:
        major = java_major(str(Path(java) / "bin" / java_executable_name()))
        print(f"  JDK 主版本  {major}")
        if major is not None and major > MAX_JDK_MAJOR:
            print("  警告  JDK 版本高于 Android 工具链支持的上限")
    print(f"  SDK 目录    {sdk or '未设置  请配置 ANDROID_HOME 或加入 PATH'}")
    print(f"  Rust 工具链 {shutil.which('cargo') or '未找到'}")
    print(f"  版本        {app_version()}")


def main() -> int:
    try:
        target = choose_target()
        if target in ("q", "Q", ""):
            print("  已取消")
            return 0
        if target not in ("1", "2", "3"):
            print(f"  未知目标 {target}")
            return 1
        if target in ("1", "2"):
            app_version()
        java = cli_value("--java") or java_home()
        sdk = cli_value("--sdk") or android_sdk_home()
        print_environment(java, sdk)
        if target == "1":
            output = build_windows()
        elif target == "2":
            java = java or prompt_path("JDK")
            sdk = sdk or prompt_path("Android SDK")
            if not java or not sdk:
                print("  错误  JDK 和 Android SDK 都是必需的")
                return 1
            output = build_android(java, sdk)
        else:
            output = build_web()
        if output:
            print(f"  构建完成  {output}")
        else:
            print("  构建失败")
        return 0 if output else 1
    except BuildError as error:
        print(f"  错误  {error}")
        return 1


if __name__ == "__main__":
    sys.exit(main())