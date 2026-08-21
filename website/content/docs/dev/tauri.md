---
title: Tauri 命令
description: Rust 侧命令全集、注册约定、平台差异与新增命令流程。
order: 8
---

# Tauri 命令

> Rust 侧能力的完整清单：命令分类、签名约定、注册方式，以及新增一条命令的完整流程。

## 本页边界

覆盖：`src-tauri/src/` 全部 `#[tauri::command]` 与 `invoke_handler` 注册。

**不**覆盖：事件（见 [事件](#/docs/dev/events)）、前端调用封装（各 `*-bridge.ts` 见对应模块文档）。

## 命令全集

| 分类 | 命令 | 说明 |
|---|---|---|
| 应用 | `open_devtools`、`exit_app` | 开发者工具、退出 |
| 文件选择 | `pick_music_folder`、`pick_music_files`、`pick_image_as_base64`、`pick_cover_image`、`pick_text_file` | 系统原生选择器 |
| 文件读写 | `save_url_to_file`、`read_text_file` | 下载 URL / 读文件 |
| 扫描 | `scan_music_folder`、`scan_music_files`、`scan_music_artist_folder` | 本地音乐扫描 |
| SQLite | `db_upsert_folder`、`db_upsert_tracks`、`db_start_play_session`、`db_end_play_session`、`db_get_listen_stats`、`db_list_listen_stats`、`db_list_top_tracks`、`db_listen_source_breakdown`、`db_get_setting`、`db_set_setting` | 曲库 / 听歌统计 / 设置 |
| API 缓存 | `api_cache_get`、`api_cache_set`、`api_cache_clear`、`api_cache_purge_expired` | 网易云响应磁盘缓存 |
| 封面缓存 | `cache_cover_url`、`cache_cover_data_url`、`clear_cover_cache` | 封面磁盘缓存；下载走阻塞线程池，带连接/总超时，配合前端并发闸防止死链占满线程池 |
| 音频 | `audio_list_devices`、`audio_get_output_mode`、`audio_set_device`、`audio_set_exclusive`、`audio_probe`、`audio_load`、`audio_play`、`audio_pause`、`audio_seek`、`audio_set_volume`、`audio_stop` | 原生播放引擎 |
| ffmpeg | `ffmpeg_detect`、`ffmpeg_validate`、`ffmpeg_set_path`、`pick_ffmpeg_executable` | 检测 / 校验 / 选路径 |
| 网络代理 | `netease_http_post` | 无 CORS POST（仅放行 music.163.com 域）；`async fn` + `spawn_blocking`，慢/挂死的网易云接口不占 UI 主线程 |
| 系统 | `get_storage_paths`、`update_global_shortcut` | 路径 / 全局快捷键 |
| macOS | `macos_now_playing_update`、`macos_now_playing_clear` | Now Playing 集成 |

## 签名与返回约定

- 返回 `Result<T, String>`；失败返回中文错误串，前端 `invoke` reject
- 结构体序列化 `#[serde(rename_all = "camelCase")]`（如 `AudioTickPayload`、`StoragePaths`）
- 平台差异用 `#[cfg(not(target_os = "android"))]` 标注（文件选择、独占音频等桌面能力）

前端调用统一封装在 `src/lib/` 下的桥接模块（如 `player/native-bridge.ts`、`local/import-folder.ts`），组件不直接 `invoke`。

## 新增命令流程

1. 在对应 `.rs` 文件写 `#[tauri::command]` 函数（职责单一，`Result<T, String>` 返回）
2. 在 `src-tauri/src/lib.rs` 的 `invoke_handler` 注册（注意平台 `cfg` 标注）
3. 前端建桥接函数（命名 `xxx` 对应命令 `xxx`），封装 `invoke` 与错误处理
4. 需要持续推送数据时改用事件（见 [事件](#/docs/dev/events)），不要在命令里轮询返回

```rust
// src-tauri/src/xxx.rs —— 示例结构
#[tauri::command]
pub fn my_command(value: String) -> Result<MyResult, String> {
    if value.is_empty() {
        return Err("参数不能为空".into());
    }
    // only do the real work; keep the command thin
    Ok(MyResult { ok: true })
}
```

```ts
// src/lib/xxx-bridge.ts —— 前端封装
import { invoke } from "@tauri-apps/api/core"

export async function myCommand(value: string): Promise<MyResult> {
    return invoke<MyResult>("my_command", { value })
}
```

## 常见问题

| 现象 | 原因与处理 |
|---|---|
| `invoke` 报命令不存在 | 未在 `invoke_handler` 注册，或拼写不一致（Rust snake_case） |
| Android 上命令失败 | 桌面专属命令带 `cfg(not(target_os = "android"))`，Android 不注册 |
| 返回结构对不上 | 确认 `rename_all = "camelCase"`（Rust 字段转前端 camelCase） |
| 长任务阻塞 UI | 同步命令跑长任务会卡事件循环；用 `async fn` 或事件推送进度 |

## 排查路径

1. 确认命令已注册：grep `invoke_handler` 列表
2. 确认前端 `invoke` 参数名与 Rust 参数名一致（tauri 2 按参数名传）
3. 确认返回类型结构（camelCase）与前端类型一致
4. 桌面功能在浏览器调试时必然失败——用 `isTauriRuntime()` 判断环境
