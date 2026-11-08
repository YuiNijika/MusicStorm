package dev.kasumi.music_storm

import android.net.Uri
import android.util.Base64
import dev.kasumi.app.bridge.KSMHostException
import dev.kasumi.app.bridge.KSMHttpHeader
import dev.kasumi.app.bridge.KSMHttpPolicy
import dev.kasumi.app.bridge.KSMHttpRequestSpec
import dev.kasumi.app.bridge.KSMPlugin
import dev.kasumi.app.bridge.KSMPluginContext
import dev.kasumi.app.bridge.KSMVirtualPath
import dev.kasumi.app.bridge.KSM
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.atomic.AtomicLong

class MusicStormPlugin : KSMPlugin {
    override val id: String = "musicstorm"
    override val commands: Set<String> = setOf(COMMAND)
    override val permissions: Set<String> = setOf(PERMISSION)
    override val events: Set<String> = setOf(EVENT)

    private val idSequence = AtomicLong(1)
    private var connectionId: String? = null
    private var miniPlayerVisible = false
    private var desktopLyricVisible = false
    private var miniPlayerState = JSONObject().apply {
        put("title", "")
        put("artist", "")
        put("coverUrl", JSONObject.NULL)
        put("isPlaying", false)
        put("positionMs", 0)
        put("durationMs", 0)
    }

    override fun validateArgs(command: String, args: JSONObject): Boolean {
        return command == COMMAND &&
            args.opt("command") is String &&
            args.opt("args") is JSONObject
    }

    override fun handle(
        command: String,
        args: JSONObject,
        context: KSMPluginContext
    ): Any {
        if (!context.hasPermission(PERMISSION)) {
            throw KSMHostException(
                "PERMISSION_DENIED",
                "The MusicStorm extension is not authorized."
            )
        }
        if (command != COMMAND) {
            throw KSMHostException(
                "UNKNOWN_COMMAND",
                "The MusicStorm command bridge is unavailable."
            )
        }
        val name = args.getString("command")
        val payload = args.getJSONObject("args")
        return dispatch(name, payload, context)
    }

    private fun dispatch(
        name: String,
        payload: JSONObject,
        context: KSMPluginContext
    ): Any {
        return when (name) {
            "event_emit" -> emitEvent(payload)
            "is_mini_player_visible" -> miniPlayerVisible
            "is_desktop_lyric_visible" -> desktopLyricVisible
            "show_mini_player", "hide_mini_player",
            "show_desktop_lyric", "hide_desktop_lyric" -> JSONObject()
                .put("visible", false)
                .put("supported", false)
            "update_mini_player" -> {
                payload.optJSONObject("state")?.let { state ->
                    miniPlayerState = JSONObject(state.toString())
                }
                JSONObject().put("updated", true)
            }
            "get_mini_player_state" -> miniPlayerState
            "update_desktop_lyric" -> JSONObject()
                .put("updated", false)
                .put("supported", false)
            "get_desktop_lyric_state" -> JSONObject()
                .put("positionMs", 0)
                .put("lines", JSONArray())
                .put("trackTitle", "")
                .put("trackArtist", "")
            "window_toggle_maximize" -> JSONObject().put("maximized", false)
            "window_start_dragging" -> JSONObject().put("dragging", false)
            "get_storage_paths" -> storagePaths(context)
            "close_devtools" -> JSONObject().put(
                "closed",
                context.hostServices?.openDevtools(false) ?: false
            )
            "read_text_file" -> readTextFile(context, payload)
            "pick_text_file" -> pickTextFile(context)
            "db_get_setting" -> dbGetSetting(context, payload)
            "db_set_setting" -> dbSetSetting(context, payload)
            "db_upsert_folder" -> dbUpsertFolder(context, payload)
            "db_upsert_tracks" -> dbUpsertTracks(context, payload)
            "db_start_play_session" -> dbStartPlaySession(context, payload)
            "db_end_play_session" -> dbEndPlaySession(context, payload)
            "db_get_listen_stats" -> dbGetListenStats(context, payload)
            "db_list_listen_stats" -> dbListListenStats(context, payload)
            "db_listen_source_breakdown" ->
                dbListenSourceBreakdown(context, payload)
            "db_list_top_tracks" -> dbListTopTracks(context, payload)
            "db_local_add_to_playlist" ->
                dbLocalAddToPlaylist(context, payload)
            "db_local_for_playlist" ->
                dbLocalForPlaylist(context, payload)
            "db_local_remove_from_playlist" ->
                dbLocalRemoveFromPlaylist(context, payload)
            "db_local_playlist_covers" ->
                dbLocalPlaylistCovers(context, payload)
            "cache_cover_data_url" -> cacheCoverDataUrl(context, payload)
            "cache_cover_url" -> cacheCoverUrl(context, payload)
            "cover_paths_exist" -> coverPathsExist(context, payload)
            "clear_cover_cache" -> clearCoverCache(context, payload, null)
            "purge_cover_cache_cmd" -> clearCoverCache(
                context,
                payload,
                payload.optLong("maxBytes", 0L).takeIf { it > 0L }
            )
            "scan_music_folder" -> scanMusicFolder(context, payload)
            "scan_music_files" -> scanMusicFiles(context, payload)
            "scan_music_artist_folder" ->
                scanMusicArtistFolder(context, payload)
            "api_cache_get" -> apiCacheGet(context, payload)
            "api_cache_set" -> apiCacheSet(context, payload)
            "api_cache_clear" -> apiCacheClear(context)
            "api_cache_purge_expired" ->
                apiCachePurgeExpired(context)
            "bilibili_set_cookie" -> bilibiliSetCookie(context, payload)
            "bilibili_clear_cookie" -> bilibiliClearCookie(context)
            "bilibili_get_json" -> bilibiliJson(context, payload, false)
            "bilibili_post_json" -> bilibiliJson(context, payload, true)
            "bilibili_cache_audio" ->
                bilibiliCacheAudio(context, payload)
            "netease_http_post" -> neteaseHttpPost(context, payload)
            "ffmpeg_detect" -> ffmpegDetect(context)
            "ffmpeg_validate" -> ffmpegValidate(context, payload)
            "ffmpeg_set_path" -> ffmpegSetPath(context, payload)
            "pick_ffmpeg_executable" -> context.hostServices
                ?.pickExternalTool("ffmpeg")
                ?: JSONObject.NULL
            "pick_music_folder", "pick_music_files" -> throw KSMHostException(
                "NOT_SUPPORTED",
                "Use the Android document picker for local music."
            )
            "macos_now_playing_update", "macos_now_playing_clear" ->
                JSONObject().put("supported", false)
            else -> throw KSMHostException(
                "NOT_SUPPORTED",
                "MusicStorm command is not implemented on Android: $name"
            )
        }
    }

    private fun emitEvent(payload: JSONObject): JSONObject {
        val event = payload.optString("event")
        if (event.isEmpty()) {
            throw KSMHostException("INVALID_ARGS", "event is required.")
        }
        val eventPayload = payload.optJSONObject("payload") ?: JSONObject()
        val envelope = JSONObject()
            .put("event", event)
            .put("payload", eventPayload)
        val delivered = KSM.broadcastEvent(EVENT, envelope)
        return JSONObject().put("emitted", delivered)
    }

    private fun storagePaths(context: KSMPluginContext): JSONObject {
        val fileSystem = context.fileSystem
        val data = fileSystem?.resolveReadableFile("app://data/musicstorm.db")
        return JSONObject()
            .put("appDir", "app://data")
            .put("configDir", "app://data")
            .put("cacheDir", "app://cache")
            .put("databasePath", "app://data/musicstorm.db")
            .put(
                "databaseExists",
                data?.exists() == true
            )
    }

    private fun readTextFile(
        context: KSMPluginContext,
        payload: JSONObject
    ): String {
        val path = payload.optString("path").trim()
        if (path.isEmpty()) {
            throw KSMHostException("INVALID_ARGS", "path is required.")
        }
        val text = context.fileSystem?.readText(path)
            ?: context.hostServices?.readPickedText(path)
            ?: throw KSMHostException(
                "IO_ERROR",
                "The text file could not be read."
            )
        return text
    }

    private fun pickTextFile(context: KSMPluginContext): Any {
        val host = context.hostServices ?: throw KSMHostException(
            "NOT_SUPPORTED",
            "The Android file service is not configured."
        )
        val path = host.openFile(
            listOf("text/*", "application/octet-stream")
        ) ?: return JSONObject.NULL
        return host.readPickedText(path) ?: throw KSMHostException(
            "IO_ERROR",
            "The text file could not be read."
        )
    }

    private fun database(context: KSMPluginContext): String {
        connectionId?.let { return it }
        synchronized(this) {
            connectionId?.let { return it }
            val host = context.hostServices ?: throw KSMHostException(
                "NOT_SUPPORTED",
                "The Android SQL service is not configured."
            )
            val opened = host.sqlOpen("sqlite", "app://data/musicstorm.db")
                ?: throw KSMHostException(
                    "NOT_SUPPORTED",
                    "The SQLite driver is not available."
                )
            connectionId = opened
            for (statement in SCHEMA) {
                host.sqlExecute(opened, statement, emptyList())
            }
            return opened
        }
    }

    private fun execute(
        context: KSMPluginContext,
        statement: String,
        params: List<Any?> = emptyList()
    ) {
        val host = context.hostServices ?: throw KSMHostException(
            "NOT_SUPPORTED",
            "The Android SQL service is not configured."
        )
        host.sqlExecute(database(context), statement, params)
    }

    private fun rows(
        context: KSMPluginContext,
        statement: String,
        params: List<Any?> = emptyList()
    ): List<JSONObject> {
        val host = context.hostServices ?: throw KSMHostException(
            "NOT_SUPPORTED",
            "The Android SQL service is not configured."
        )
        val result = host.sqlQuery(database(context), statement, params)
            ?: return emptyList()
        return result.rows.map { row ->
            JSONObject().apply {
                result.columns.forEachIndexed { index, column ->
                    put(column, row.getOrNull(index) ?: JSONObject.NULL)
                }
            }
        }
    }

    private fun dbGetSetting(
        context: KSMPluginContext,
        payload: JSONObject
    ): Any {
        val key = payload.optString("key")
        if (key.isEmpty()) {
            throw KSMHostException("INVALID_ARGS", "key is required.")
        }
        val row = rows(
            context,
            "SELECT value FROM app_setting WHERE key = ?",
            listOf(key)
        ).firstOrNull() ?: return JSONObject.NULL
        return row.opt("value") ?: JSONObject.NULL
    }

    private fun dbSetSetting(
        context: KSMPluginContext,
        payload: JSONObject
    ): Any {
        val key = payload.optString("key")
        val value = payload.opt("value")?.toString() ?: ""
        if (key.isEmpty()) {
            throw KSMHostException("INVALID_ARGS", "key is required.")
        }
        execute(
            context,
            "INSERT INTO app_setting (key, value) VALUES (?, ?) " +
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            listOf(key, value)
        )
        return JSONObject().put("saved", true)
    }

    private fun dbUpsertFolder(
        context: KSMPluginContext,
        payload: JSONObject
    ): Any {
        val input = payload.optJSONObject("input")
            ?: throw KSMHostException("INVALID_ARGS", "input is required.")
        val path = input.optString("path")
        if (path.isEmpty()) {
            throw KSMHostException("INVALID_ARGS", "input.path is required.")
        }
        val now = System.currentTimeMillis()
        val displayName = input.optString("displayName").ifEmpty {
            path.substringAfterLast('/').ifEmpty { path }
        }
        val trackCount = input.optInt("trackCount", 0)
        val artist = input.optString("artist")
        val coverData = input.optString("coverData").ifEmpty { null }
        val existing = rows(
            context,
            "SELECT id FROM library_folder WHERE path = ?",
            listOf(path)
        ).firstOrNull()?.optString("id")
        val id = existing ?: newId("folder")
        if (existing == null) {
            execute(
                context,
                "INSERT INTO library_folder (" +
                    "id, path, display_name, recursive, track_count, " +
                    "last_scanned_at, created_at, updated_at, artist, cover_data" +
                    ") VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)",
                listOf(
                    id,
                    path,
                    displayName,
                    trackCount,
                    now,
                    now,
                    now,
                    artist,
                    coverData
                )
            )
        } else {
            execute(
                context,
                "UPDATE library_folder SET display_name = ?, track_count = ?, " +
                    "last_scanned_at = ?, updated_at = ?, artist = ?, " +
                    "cover_data = ? WHERE id = ?",
                listOf(
                    displayName,
                    trackCount,
                    now,
                    now,
                    artist,
                    coverData,
                    id
                )
            )
        }
        return id
    }

    private fun dbUpsertTracks(
        context: KSMPluginContext,
        payload: JSONObject
    ): Any {
        val tracks = payload.optJSONArray("tracks") ?: JSONArray()
        val now = System.currentTimeMillis()
        for (index in 0 until tracks.length()) {
            val track = tracks.optJSONObject(index) ?: continue
            val id = track.optString("id")
            if (id.isEmpty()) {
                continue
            }
            val folderPath = track.optString("folderPath")
            val folderId = if (folderPath.isEmpty()) {
                null
            } else {
                rows(
                    context,
                    "SELECT id FROM library_folder WHERE path = ?",
                    listOf(folderPath)
                ).firstOrNull()?.optString("id")
            }
            execute(
                context,
                "INSERT INTO track (" +
                    "id, source, title, artist, album, duration_ms, cover_url, " +
                    "file_path, folder_id, lrc_path, content_hash, file_name, " +
                    "added_at, updated_at" +
                    ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
                    "ON CONFLICT(id) DO UPDATE SET " +
                    "source = excluded.source, title = excluded.title, " +
                    "artist = excluded.artist, album = excluded.album, " +
                    "duration_ms = excluded.duration_ms, " +
                    "cover_url = excluded.cover_url, " +
                    "file_path = excluded.file_path, " +
                    "folder_id = excluded.folder_id, " +
                    "lrc_path = excluded.lrc_path, " +
                    "content_hash = excluded.content_hash, " +
                    "file_name = excluded.file_name, " +
                    "updated_at = excluded.updated_at",
                listOf(
                    id,
                    track.optString("source"),
                    track.optString("title"),
                    track.optString("artist"),
                    track.optString("album"),
                    track.optLong("durationMs", 0L),
                    track.optString("coverUrl").ifEmpty { null },
                    track.optString("filePath").ifEmpty { null },
                    folderId,
                    track.optString("lrcPath").ifEmpty { null },
                    track.optString("contentHash").ifEmpty { null },
                    track.optString("fileName").ifEmpty { null },
                    now,
                    now
                )
            )
        }
        return JSONObject().put("updated", tracks.length())
    }

    private fun dbStartPlaySession(
        context: KSMPluginContext,
        payload: JSONObject
    ): Any {
        val input = payload.optJSONObject("input")
            ?: throw KSMHostException("INVALID_ARGS", "input is required.")
        val id = input.optString("id")
        if (id.isEmpty()) {
            throw KSMHostException("INVALID_ARGS", "input.id is required.")
        }
        execute(
            context,
            "INSERT INTO play_session (" +
                "id, track_id, source, started_at, ended_at, listened_ms, " +
                "completed, quality_br, title, artist, album, file_path, " +
                "file_name, content_hash, cover_url" +
                ") VALUES (?, ?, ?, ?, NULL, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?) " +
                "ON CONFLICT(id) DO UPDATE SET " +
                "track_id = excluded.track_id, source = excluded.source, " +
                "started_at = excluded.started_at, " +
                "quality_br = excluded.quality_br, title = excluded.title, " +
                "artist = excluded.artist, album = excluded.album, " +
                "file_path = excluded.file_path, " +
                "file_name = excluded.file_name, " +
                "content_hash = excluded.content_hash, " +
                "cover_url = excluded.cover_url",
            listOf(
                id,
                input.optString("trackId"),
                input.optString("source"),
                input.optLong("startedAt", System.currentTimeMillis()),
                input.optInt("qualityBr", 0).takeIf { it > 0 },
                input.optString("title").ifEmpty { null },
                input.optString("artist").ifEmpty { null },
                input.optString("album").ifEmpty { null },
                input.optString("filePath").ifEmpty { null },
                input.optString("fileName").ifEmpty { null },
                input.optString("contentHash").ifEmpty { null },
                input.optString("coverUrl").ifEmpty { null }
            )
        )
        return JSONObject().put("started", true)
    }

    private fun dbEndPlaySession(
        context: KSMPluginContext,
        payload: JSONObject
    ): Any {
        val input = payload.optJSONObject("input")
            ?: throw KSMHostException("INVALID_ARGS", "input is required.")
        val id = input.optString("id")
        val trackId = input.optString("trackId")
        if (id.isEmpty()) {
            throw KSMHostException("INVALID_ARGS", "input.id is required.")
        }
        val startedAt = input.optLong("startedAt", System.currentTimeMillis())
        val listenedMs = input.optLong("listenedMs", 0L)
        execute(
            context,
            "UPDATE play_session SET ended_at = ?, listened_ms = ?, " +
                "completed = ?, title = COALESCE(?, title), " +
                "artist = COALESCE(?, artist), album = COALESCE(?, album), " +
                "file_path = COALESCE(?, file_path), " +
                "file_name = COALESCE(?, file_name), " +
                "content_hash = COALESCE(?, content_hash), " +
                "cover_url = COALESCE(?, cover_url) WHERE id = ?",
            listOf(
                input.optLong("endedAt", System.currentTimeMillis()),
                listenedMs,
                if (input.optBoolean("completed", false)) 1 else 0,
                input.optString("title").ifEmpty { null },
                input.optString("artist").ifEmpty { null },
                input.optString("album").ifEmpty { null },
                input.optString("filePath").ifEmpty { null },
                input.optString("fileName").ifEmpty { null },
                input.optString("contentHash").ifEmpty { null },
                input.optString("coverUrl").ifEmpty { null },
                id
            )
        )
        if (listenedMs <= 0L || trackId.isEmpty()) {
            return JSONObject().put("recorded", false)
        }
        val day = dayKey(startedAt)
        execute(
            context,
            "INSERT INTO listen_daily (day, play_count, unique_tracks, total_ms) " +
                "VALUES (?, 1, 0, ?) ON CONFLICT(day) DO UPDATE SET " +
                "play_count = listen_daily.play_count + 1, " +
                "total_ms = listen_daily.total_ms + excluded.total_ms",
            listOf(day, listenedMs)
        )
        execute(
            context,
            "INSERT OR IGNORE INTO listen_day_track (day, track_id) VALUES (?, ?)",
            listOf(day, trackId)
        )
        execute(
            context,
            "UPDATE listen_daily SET unique_tracks = " +
                "(SELECT COUNT(*) FROM listen_day_track WHERE day = ?) " +
                "WHERE day = ?",
            listOf(day, day)
        )
        return JSONObject().put("recorded", true)
    }

    private fun dbGetListenStats(
        context: KSMPluginContext,
        payload: JSONObject
    ): Any {
        val day = payload.optString("day").ifEmpty { dayKey(System.currentTimeMillis()) }
        return rows(
            context,
            "SELECT day, play_count AS playCount, " +
                "unique_tracks AS uniqueTracks, total_ms AS totalMs " +
                "FROM listen_daily WHERE day = ?",
            listOf(day)
        ).firstOrNull() ?: JSONObject.NULL
    }

    private fun dbListListenStats(
        context: KSMPluginContext,
        payload: JSONObject
    ): Any {
        val fromDay = payload.optString("fromDay")
            .ifEmpty {
                dayKey(
                    System.currentTimeMillis() -
                        payload.optInt("days", 7).coerceAtLeast(1) * 86_400_000L
                )
            }
        val toDay = payload.optString("toDay")
            .ifEmpty { dayKey(System.currentTimeMillis()) }
        return JSONArray(
            rows(
                context,
                "SELECT day, play_count AS playCount, " +
                    "unique_tracks AS uniqueTracks, total_ms AS totalMs " +
                    "FROM listen_daily WHERE day >= ? AND day <= ? " +
                    "ORDER BY day ASC",
                listOf(fromDay, toDay)
            )
        )
    }

    private fun dbListenSourceBreakdown(
        context: KSMPluginContext,
        payload: JSONObject
    ): Any {
        val fromDay = payload.optString("fromDay")
            .ifEmpty {
                dayKey(
                    System.currentTimeMillis() -
                        (payload.optInt("days", 7).takeIf { it > 0 } ?: 7) *
                        86_400_000L
                )
            }
        val toDay = payload.optString("toDay")
            .ifEmpty { dayKey(System.currentTimeMillis()) }
        return JSONArray(
            rows(
                context,
                "SELECT source, COUNT(*) AS playCount, " +
                    "SUM(listened_ms) AS totalMs FROM play_session " +
                    "WHERE started_at >= ? AND started_at <= ? " +
                    "GROUP BY source ORDER BY totalMs DESC",
                listOf(dayStartMs(fromDay), dayEndMs(toDay))
            )
        )
    }

    private fun dbListTopTracks(
        context: KSMPluginContext,
        payload: JSONObject
    ): Any {
        val limit = payload.optInt("limit", 20).coerceIn(1, 200)
        val fromDay = payload.optString("fromDay")
            .ifEmpty {
                dayKey(
                    System.currentTimeMillis() -
                        (payload.optInt("days", 7).takeIf { it > 0 } ?: 7) *
                        86_400_000L
                )
            }
        val toDay = payload.optString("toDay")
            .ifEmpty { dayKey(System.currentTimeMillis()) }
        return JSONArray(
            rows(
                context,
                "SELECT track_id AS trackId, source, " +
                    "COALESCE(MAX(title), '') AS title, " +
                    "COALESCE(MAX(artist), '') AS artist, " +
                    "COALESCE(MAX(album), '') AS album, " +
                    "COALESCE(MAX(cover_url), NULL) AS coverUrl, " +
                    "COALESCE(MAX(file_path), NULL) AS filePath, " +
                    "COALESCE(MAX(file_name), NULL) AS fileName, " +
                    "COALESCE(MAX(content_hash), NULL) AS contentHash, " +
                    "COUNT(*) AS playCount, SUM(listened_ms) AS totalMs " +
                    "FROM play_session WHERE started_at >= ? AND started_at <= ? " +
                    "GROUP BY track_id, source ORDER BY totalMs DESC LIMIT ?",
                listOf(dayStartMs(fromDay), dayEndMs(toDay), limit)
            )
        )
    }

    private fun dbLocalAddToPlaylist(
        context: KSMPluginContext,
        payload: JSONObject
    ): Any {
        val input = payload.optJSONObject("input")
            ?: throw KSMHostException("INVALID_ARGS", "input is required.")
        val playlistId = input.optString("playlistId")
        val trackIds = input.optJSONArray("trackIds") ?: JSONArray()
        val anchorTrackId = input.optString("anchorTrackId").ifEmpty { null }
        val anchorCover = input.optString("anchorCover").ifEmpty { null }
        val now = System.currentTimeMillis()
        for (index in 0 until trackIds.length()) {
            val trackId = trackIds.optString(index)
            if (trackId.isEmpty()) {
                continue
            }
            execute(
                context,
                "INSERT INTO local_playlist_entry (" +
                    "playlist_id, track_id, added_at, anchor_track_id, anchor_cover" +
                    ") VALUES (?, ?, ?, ?, ?) ON CONFLICT(playlist_id, track_id) " +
                    "DO UPDATE SET added_at = excluded.added_at, " +
                    "anchor_track_id = excluded.anchor_track_id, " +
                    "anchor_cover = excluded.anchor_cover",
                listOf(playlistId, trackId, now, anchorTrackId, anchorCover)
            )
        }
        return JSONObject().put("added", trackIds.length())
    }

    private fun dbLocalForPlaylist(
        context: KSMPluginContext,
        payload: JSONObject
    ): Any {
        val playlistId = payload.optString("playlistId")
        return JSONArray(
            rows(
                context,
                "SELECT t.id, t.title, t.artist, t.album, " +
                    "t.duration_ms AS durationMs, t.cover_url AS coverUrl, " +
                    "t.file_path AS filePath, e.added_at AS addedAt, " +
                    "e.anchor_track_id AS anchorTrackId " +
                    "FROM local_playlist_entry e " +
                    "JOIN track t ON t.id = e.track_id " +
                    "WHERE e.playlist_id = ? ORDER BY e.added_at DESC",
                listOf(playlistId)
            )
        )
    }

    private fun dbLocalRemoveFromPlaylist(
        context: KSMPluginContext,
        payload: JSONObject
    ): Any {
        val playlistId = payload.optString("playlistId")
        val trackIds = payload.optJSONArray("trackIds") ?: JSONArray()
        for (index in 0 until trackIds.length()) {
            execute(
                context,
                "DELETE FROM local_playlist_entry " +
                    "WHERE playlist_id = ? AND track_id = ?",
                listOf(playlistId, trackIds.optString(index))
            )
        }
        return JSONObject().put("removed", trackIds.length())
    }

    private fun dbLocalPlaylistCovers(
        context: KSMPluginContext,
        payload: JSONObject
    ): Any {
        val playlistIds = payload.optJSONArray("playlistIds") ?: JSONArray()
        val result = JSONArray()
        for (index in 0 until playlistIds.length()) {
            val playlistId = playlistIds.optString(index)
            val row = rows(
                context,
                "SELECT e.playlist_id AS playlistId, t.cover_url AS coverUrl, " +
                    "e.anchor_cover AS anchorCover, " +
                    "e.anchor_track_id AS anchorTrackId " +
                    "FROM local_playlist_entry e " +
                    "JOIN track t ON t.id = e.track_id " +
                    "WHERE e.playlist_id = ? " +
                    "ORDER BY e.added_at DESC LIMIT 1",
                listOf(playlistId)
            ).firstOrNull() ?: continue
            result.put(row)
        }
        return result
    }

    private fun cacheCoverDataUrl(
        context: KSMPluginContext,
        payload: JSONObject
    ): JSONObject {
        val dataUrl = payload.optString("dataUrl")
        val comma = dataUrl.indexOf(',')
        if (!dataUrl.startsWith("data:") || comma <= 5) {
            throw KSMHostException("INVALID_ARGS", "dataUrl is not a data URL.")
        }
        val header = dataUrl.substring(5, comma)
        if (!header.contains(";base64")) {
            throw KSMHostException("INVALID_ARGS", "dataUrl must be base64 encoded.")
        }
        val mime = header.substringBefore(';')
        val bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT)
        return cacheCoverBytes(context, bytes, mime)
    }

    private fun cacheCoverUrl(
        context: KSMPluginContext,
        payload: JSONObject
    ): JSONObject {
        val raw = payload.optString("url")
        if (raw.isEmpty()) {
            throw KSMHostException("INVALID_ARGS", "url is required.")
        }
        val url = if (raw.startsWith("http://")) {
            "https://" + raw.removePrefix("http://")
        } else {
            raw
        }
        if (!url.startsWith("https://")) {
            throw KSMHostException("INVALID_ARGS", "Cover URLs must use HTTPS.")
        }
        val imageHost = URL(url).host.lowercase(Locale.ROOT)
        val bilibiliImageHost =
            imageHost == "bilibili.com" ||
                imageHost.endsWith(".bilibili.com") ||
                imageHost == "hdslb.com" ||
                imageHost.endsWith(".hdslb.com") ||
                imageHost == "biliimg.com" ||
                imageHost.endsWith(".biliimg.com")
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15_000
            readTimeout = 20_000
            instanceFollowRedirects = true
            setRequestProperty("User-Agent", "MusicStorm/26")
            if (bilibiliImageHost) {
                setRequestProperty("Referer", "https://www.bilibili.com/")
            }
        }
        try {
            val status = connection.responseCode
            if (status !in 200..299) {
                throw KSMHostException(
                    "IO_ERROR",
                    "Cover download failed with HTTP $status."
                )
            }
            val mime = connection.contentType
                ?.substringBefore(';')
                ?.takeIf { it.startsWith("image/") }
                ?: "image/jpeg"
            val bytes = readLimited(connection.inputStream)
            return cacheCoverBytes(context, bytes, mime)
        } finally {
            connection.disconnect()
        }
    }

    private fun cacheCoverBytes(
        context: KSMPluginContext,
        bytes: ByteArray,
        mime: String
    ): JSONObject {
        if (bytes.isEmpty()) {
            throw KSMHostException("IO_ERROR", "The cover image is empty.")
        }
        val fileSystem = context.fileSystem ?: throw KSMHostException(
            "NOT_SUPPORTED",
            "The filesystem is not configured."
        )
        val extension = when (mime.lowercase(Locale.US)) {
            "image/png" -> "png"
            "image/webp" -> "webp"
            "image/gif" -> "gif"
            "image/avif" -> "avif"
            else -> "jpg"
        }
        val hash = sha256(bytes)
        val original = "app://cache/covers/originals/$hash.$extension"
        val thumbnail = "app://cache/covers/thumbnails/$hash.$extension"
        if (!fileSystem.writeBytes(original, bytes)) {
            throw KSMHostException("IO_ERROR", "The cover could not be cached.")
        }
        fileSystem.writeBytes(thumbnail, bytes)
        return JSONObject()
            .put("originalPath", original)
            .put("thumbnailPath", thumbnail)
    }

    private fun coverPathsExist(
        context: KSMPluginContext,
        payload: JSONObject
    ): Any {
        val paths = payload.optJSONArray("paths") ?: JSONArray()
        val fileSystem = context.fileSystem
        val result = JSONArray()
        for (index in 0 until paths.length()) {
            val path = paths.optString(index)
            result.put(
                fileSystem != null &&
                    path.isNotEmpty() &&
                    fileSystem.exists(path)
            )
        }
        return result
    }

    private fun clearCoverCache(
        context: KSMPluginContext,
        payload: JSONObject,
        maxBytes: Long?
    ): Any {
        val fileSystem = context.fileSystem ?: return JSONObject()
            .put("removed", 0)
            .put("bytes", 0L)
        val keep = mutableSetOf<String>()
        payload.optJSONArray("keepHashes")?.let { values ->
            for (index in 0 until values.length()) {
                values.optString(index).takeIf { it.isNotEmpty() }?.let(keep::add)
            }
        }
        val files = mutableListOf<CoverFile>()
        for (root in listOf(
            "app://cache/covers/originals",
            "app://cache/covers/thumbnails"
        )) {
            collectCoverFiles(fileSystem, root, keep, files)
        }
        var total = files.sumOf { it.size }
        var removed = 0
        var bytesRemoved = 0L
        val ordered = files.sortedWith(
            compareBy<CoverFile> { it.modifiedAt ?: 0L }
        )
        for (file in ordered) {
            if (maxBytes != null && total <= maxBytes) {
                break
            }
            if (file.hash in keep) {
                continue
            }
            if (fileSystem.remove(file.path)) {
                total -= file.size
                removed += 1
                bytesRemoved += file.size
            }
        }
        return JSONObject()
            .put("removed", removed)
            .put("bytes", bytesRemoved)
    }

    private fun collectCoverFiles(
        fileSystem: dev.kasumi.app.bridge.KSMFileSystem,
        root: String,
        keep: Set<String>,
        output: MutableList<CoverFile>
    ) {
        val entries = fileSystem.readDir(root) ?: return
        for (entry in entries) {
            if (entry.kind == dev.kasumi.app.bridge.KSMFileKind.DIRECTORY) {
                collectCoverFiles(fileSystem, entry.path, keep, output)
                continue
            }
            val hash = entry.name.substringBefore('.').lowercase(Locale.US)
            if (hash.length != 64) {
                continue
            }
            output.add(CoverFile(entry.path, hash, entry.size, entry.modifiedAt))
        }
    }

    private fun scanMusicFolder(
        context: KSMPluginContext,
        payload: JSONObject
    ): Any {
        val path = payload.optString("path")
        if (path.isEmpty()) {
            throw KSMHostException("INVALID_ARGS", "path is required.")
        }
        val host = context.hostServices ?: throw KSMHostException(
            "NOT_SUPPORTED",
            "The Android media service is not configured."
        )
        val entries = if (path.startsWith("app://scope/")) {
            host.walk(path).orEmpty()
        } else {
            context.fileSystem?.let { fileSystem ->
                fileSystem.readDir(path).orEmpty().map {
                    dev.kasumi.app.bridge.KSMWalkEntry(
                        it.path,
                        it.name,
                        it.kind == dev.kasumi.app.bridge.KSMFileKind.DIRECTORY,
                        it.size,
                        it.modifiedAt
                    )
                }
            }.orEmpty()
        }
        return JSONArray(
            entries
                .filter { !it.directory && isAudioFile(it.name) }
                .mapNotNull { entry ->
                    val probe = host.probeMedia(entry.path)
                    trackFromProbe(entry.path, entry.name, probe)
                }
        )
    }

    private fun scanMusicFiles(
        context: KSMPluginContext,
        payload: JSONObject
    ): Any {
        val paths = payload.optJSONArray("paths") ?: JSONArray()
        val host = context.hostServices ?: throw KSMHostException(
            "NOT_SUPPORTED",
            "The Android media service is not configured."
        )
        return JSONArray(
            (0 until paths.length()).mapNotNull { index ->
                val path = paths.optString(index)
                if (!isAudioFile(path)) {
                    return@mapNotNull null
                }
                trackFromProbe(
                    path,
                    path.substringAfterLast('/'),
                    host.probeMedia(path)
                )
            }
        )
    }

    private fun scanMusicArtistFolder(
        context: KSMPluginContext,
        payload: JSONObject
    ): Any {
        val path = payload.optString("path")
        val host = context.hostServices ?: throw KSMHostException(
            "NOT_SUPPORTED",
            "The Android media service is not configured."
        )
        if (!path.startsWith("app://scope/")) {
            throw KSMHostException(
                "INVALID_ARGS",
                "Artist folders must come from the Android document picker."
            )
        }
        val entries = host.walk(path).orEmpty()
        val audio = entries.filter { !it.directory && isAudioFile(it.name) }
        val groupFolders = audio
            .map { it.path.substringBeforeLast('/') }
            .filter { it != path }
            .distinct()
        val tracks = audio.mapNotNull { entry ->
            val probe = host.probeMedia(entry.path)
            trackFromProbe(entry.path, entry.name, probe)
        }
        return JSONObject()
            .put("displayName", path.substringAfterLast('/').ifEmpty { "本地艺人" })
            .put("groupFolders", JSONArray(groupFolders))
            .put("tracks", JSONArray(tracks))
    }

    private fun trackFromProbe(
        path: String,
        name: String,
        probe: dev.kasumi.app.bridge.KSMMediaProbe?
    ): JSONObject {
        val stem = name.substringBeforeLast('.', name)
        return JSONObject()
            .put("id", sha256(path.toByteArray(Charsets.UTF_8)).take(32))
            .put("title", probe?.title?.ifEmpty { null } ?: stem)
            .put("artist", probe?.artist ?: "")
            .put("album", probe?.album ?: "")
            .put("path", path)
            .put("durationMs", probe?.durationMs ?: 0)
            .put("fileName", name)
            .put("coverPath", JSONObject.NULL)
            .put("lyricText", JSONObject.NULL)
            .put("lrcPath", JSONObject.NULL)
    }

    private fun optionalString(payload: JSONObject, key: String): String? {
        val value = payload.opt(key)
        return if (value == null || value == JSONObject.NULL) {
            null
        } else {
            value.toString()
        }
    }

    private fun settingValue(
        context: KSMPluginContext,
        key: String
    ): String? {
        return rows(
            context,
            "SELECT value FROM app_setting WHERE key = ?",
            listOf(key)
        ).firstOrNull()?.optString("value")
    }

    private fun writeSettingValue(
        context: KSMPluginContext,
        key: String,
        value: String
    ) {
        execute(
            context,
            "INSERT INTO app_setting (key, value) VALUES (?, ?) " +
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            listOf(key, value)
        )
    }

    private fun urlEncode(value: String): String {
        return java.net.URLEncoder.encode(value, "UTF-8")
            .replace("+", "%20")
    }

    private fun formEncode(value: JSONObject): String {
        val pairs = mutableListOf<String>()
        val keys = value.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            val item = value.opt(key)
            if (
                item == null ||
                item == JSONObject.NULL ||
                item is JSONObject ||
                item is JSONArray
            ) {
                continue
            }
            pairs.add("${urlEncode(key)}=${urlEncode(item.toString())}")
        }
        return pairs.joinToString("&")
    }

    private fun performJson(
        context: KSMPluginContext,
        method: String,
        url: String,
        headers: List<KSMHttpHeader>,
        body: String,
        userAgent: String? = null,
        referer: String? = null,
        cookieHeader: String? = null
    ): Any {
        val host = context.hostServices ?: throw KSMHostException(
            "NOT_SUPPORTED",
            "The Android HTTP service is not configured."
        )
        val response = host.httpRequest(
            KSMHttpRequestSpec(
                url = url,
                method = method,
                headers = headers,
                body = body,
                userAgent = userAgent,
                referer = referer,
                cookieHeader = cookieHeader
            ),
            context.requestId
        ) ?: throw KSMHostException(
            "IO_ERROR",
            "The upstream request failed."
        )
        if (response.status !in 200..299) {
            throw KSMHostException(
                "IO_ERROR",
                "The upstream request failed with HTTP ${response.status}."
            )
        }
        if (response.body.toByteArray(Charsets.UTF_8).size > 8 * 1024 * 1024) {
            throw KSMHostException(
                "RESOURCE_LIMIT",
                "The upstream response is too large."
            )
        }
        return try {
            JSONTokener(response.body).nextValue()
        } catch (_: Exception) {
            throw KSMHostException(
                "IO_ERROR",
                "The upstream response is not valid JSON."
            )
        }
    }

    private fun apiCacheGet(
        context: KSMPluginContext,
        payload: JSONObject
    ): Any {
        val key = payload.optString("key")
        if (key.isEmpty()) {
            throw KSMHostException("INVALID_ARGS", "key is required.")
        }
        val now = System.currentTimeMillis()
        execute(
            context,
            "DELETE FROM api_cache WHERE expires_at < ?",
            listOf(now)
        )
        val row = rows(
            context,
            "SELECT body, created_at, expires_at FROM api_cache " +
                "WHERE cache_key = ? AND expires_at >= ?",
            listOf(key, now)
        ).firstOrNull() ?: return JSONObject.NULL
        return JSONObject()
            .put("body", row.optString("body"))
            .put("createdAt", row.optLong("created_at"))
            .put("expiresAt", row.optLong("expires_at"))
    }

    private fun apiCacheSet(
        context: KSMPluginContext,
        payload: JSONObject
    ): Any {
        val key = payload.optString("key")
        if (key.isEmpty()) {
            throw KSMHostException("INVALID_ARGS", "key is required.")
        }
        val body = payload.optString("body")
        val ttl = payload.optLong("ttlMs", 0L).coerceAtLeast(1_000L)
        val now = System.currentTimeMillis()
        execute(
            context,
            "DELETE FROM api_cache WHERE expires_at < ?",
            listOf(now)
        )
        execute(
            context,
            "INSERT INTO api_cache (cache_key, body, created_at, expires_at) " +
                "VALUES (?, ?, ?, ?) " +
                "ON CONFLICT(cache_key) DO UPDATE SET " +
                "body = excluded.body, created_at = excluded.created_at, " +
                "expires_at = excluded.expires_at",
            listOf(key, body, now, now + ttl)
        )
        return JSONObject().put("saved", true)
    }

    private fun apiCacheClear(context: KSMPluginContext): Any {
        execute(context, "DELETE FROM api_cache")
        return JSONObject().put("cleared", true)
    }

    private fun apiCachePurgeExpired(context: KSMPluginContext): Any {
        val now = System.currentTimeMillis()
        val total = rows(
            context,
            "SELECT COUNT(*) AS total FROM api_cache WHERE expires_at < ?",
            listOf(now)
        ).firstOrNull()?.optLong("total") ?: 0L
        execute(
            context,
            "DELETE FROM api_cache WHERE expires_at < ?",
            listOf(now)
        )
        return total
    }

    private fun bilibiliSetCookie(
        context: KSMPluginContext,
        payload: JSONObject
    ): Any {
        val cookie = payload.optString("cookie").trim()
        if (cookie.isEmpty()) {
            throw KSMHostException("INVALID_ARGS", "登录信息为空。")
        }
        writeSettingValue(context, "bilibili.cookie", cookie)
        return JSONObject().put("saved", true)
    }

    private fun bilibiliClearCookie(context: KSMPluginContext): Any {
        execute(
            context,
            "DELETE FROM app_setting WHERE key = ?",
            listOf("bilibili.cookie")
        )
        return JSONObject().put("cleared", true)
    }

    private fun bilibiliCacheAudio(
        context: KSMPluginContext,
        payload: JSONObject
    ): JSONObject {
        val hostServices = context.hostServices
            ?: throw KSMHostException(
                "NOT_SUPPORTED",
                "The audio cache service is not configured."
            )
        val fileSystem = context.fileSystem
            ?: throw KSMHostException(
                "NOT_SUPPORTED",
                "The audio cache service is not configured."
            )
        val bvid = payload.optString("bvid").trim()
        val validBvid = bvid.length == 12 &&
            bvid.startsWith("BV") &&
            bvid.substring(2).all { character ->
                character in '0'..'9' ||
                    character in 'A'..'Z' ||
                    character in 'a'..'z'
            }
        if (!validBvid) {
            throw KSMHostException("INVALID_ARGS", "视频编号无效")
        }
        val cid = payload.optLong("cid", 0L)
        val audioId = payload.optLong("audioId", 0L)
        if (cid <= 0L || audioId <= 0L) {
            throw KSMHostException("INVALID_ARGS", "音频编号无效")
        }
        val extension = payload.optString("extension")
            .trim()
            .lowercase(Locale.ROOT)
        if (extension != "flac" && extension != "m4a") {
            throw KSMHostException("INVALID_ARGS", "音频格式无效")
        }
        val url = payload.optString("url").trim()
        val parsed = KSMHttpPolicy.parseHttpUrl(url, httpsOnly = true)
            ?: throw KSMHostException("INVALID_ARGS", "音频地址无效")
        val host = parsed.host.lowercase(Locale.ROOT)
        val mediaHost = host == "bilivideo.com" ||
            host.endsWith(".bilivideo.com") ||
            host == "bilivideo.cn" ||
            host.endsWith(".bilivideo.cn") ||
            host == "hdslb.com" ||
            host.endsWith(".hdslb.com") ||
            host == "szbdyd.com" ||
            host.endsWith(".szbdyd.com") ||
            (host.startsWith("upos-") && host.endsWith(".akamaized.net"))
        if (!mediaHost) {
            throw KSMHostException(
                "PERMISSION_DENIED",
                "音频地址不在哔哩哔哩媒体域名内"
            )
        }
        val path =
            "app://cache/bilibili/$bvid-$cid-$audioId.$extension"
        val metadata = fileSystem.stat(path)
        if (
            metadata != null &&
            metadata.kind == dev.kasumi.app.bridge.KSMFileKind.FILE &&
            metadata.size > 0L
        ) {
            return JSONObject().put("path", path).put("reused", true)
        }
        val headers = mutableListOf(
            KSMHttpHeader("Referer", "https://www.bilibili.com"),
            KSMHttpHeader(
                "User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                    "AppleWebKit/537.36 (KHTML, like Gecko) " +
                    "Chrome/131.0.0.0 Safari/537.36"
            ),
            KSMHttpHeader("Accept", "*/*")
        )
        settingValue(context, "bilibili.cookie")
            ?.takeIf { it.isNotEmpty() }
            ?.let { headers.add(KSMHttpHeader("Cookie", it)) }
        val downloaded = hostServices.downloadTrusted(
            url,
            path,
            true,
            context.requestId,
            headers,
            listOf(
                "bilivideo.com",
                "bilivideo.cn",
                "hdslb.com",
                "szbdyd.com",
                "akamaized.net"
            )
        ) ?: throw KSMHostException(
            "IO_ERROR",
            "下载哔哩哔哩音频失败"
        )
        return JSONObject()
            .put("path", downloaded.path)
            .put("reused", false)
    }

    private fun bilibiliJson(
        context: KSMPluginContext,
        payload: JSONObject,
        post: Boolean
    ): Any {
        val url = payload.optString("url").trim()
        if (url.isEmpty()) {
            throw KSMHostException("INVALID_ARGS", "url is required.")
        }
        val passport = url.startsWith("https://passport.bilibili.com/")
        val cookie = optionalString(payload, "cookie")
            ?.ifEmpty { null }
            ?: settingValue(context, "bilibili.cookie")
            ?: ""
        var referer = "https://www.bilibili.com"
        val userAgent = if (passport) {
            "Mozilla/5.0 BiliDroid/2.0.1 os/android " +
                "mobi_app/android_hd build/2001100 channel/master"
        } else {
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                "AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/131.0.0.0 Safari/537.36"
        }
        val headers = mutableListOf(
            KSMHttpHeader("Origin", "https://www.bilibili.com"),
            KSMHttpHeader("env", "prod"),
            KSMHttpHeader("app-key", if (passport) "android_hd" else "android64"),
            KSMHttpHeader("Accept", "application/json"),
            KSMHttpHeader("Accept-Language", "zh-CN,zh;q=0.9"),
            KSMHttpHeader("Sec-Fetch-Site", "same-site"),
            KSMHttpHeader("Sec-Fetch-Mode", "cors")
        )
        var body = ""
        if (post) {
            val form = payload.opt("body")
            body = when (form) {
                is JSONObject -> formEncode(form)
                is String -> form
                else -> ""
            }
            headers.add(
                KSMHttpHeader(
                    "Content-Type",
                    "application/x-www-form-urlencoded; charset=utf-8"
                )
            )
            val requestedReferer = payload.optString("refererUrl").trim()
            if (requestedReferer.isNotEmpty()) {
                referer = requestedReferer
            }
        }
        return performJson(
            context,
            if (post) "POST" else "GET",
            url,
            headers,
            body,
            userAgent,
            referer,
            cookie
        )
    }

    private fun neteaseHttpPost(
        context: KSMPluginContext,
        payload: JSONObject
    ): Any {
        val url = payload.optString("url").trim()
        val allowed =
            url.startsWith("https://music.163.com/") ||
                url.startsWith("https://interface.music.163.com/") ||
                url.startsWith("https://interface3.music.163.com/") ||
                url.startsWith("https://interfacepc.music.163.com/")
        if (!allowed) {
            throw KSMHostException(
                "INVALID_ARGS",
                "不允许的网易云请求域名。"
            )
        }
        val host = context.hostServices ?: throw KSMHostException(
            "NOT_SUPPORTED",
            "The Android HTTP service is not configured."
        )
        val headers = mutableListOf(
            KSMHttpHeader("Content-Type", "application/x-www-form-urlencoded")
        )
        val userAgent = optionalString(payload, "userAgent")
        val referer = optionalString(payload, "referer")
        optionalString(payload, "origin")?.takeIf { it.isNotEmpty() }?.let {
            headers.add(KSMHttpHeader("Origin", it))
        }
        val cookie = optionalString(payload, "cookie")
        optionalString(payload, "realIp")?.takeIf { it.isNotEmpty() }?.let {
            headers.add(KSMHttpHeader("X-Real-IP", it))
            headers.add(KSMHttpHeader("X-Forwarded-For", it))
        }
        val response = host.httpRequest(
            KSMHttpRequestSpec(
                url = url,
                method = "POST",
                headers = headers,
                body = payload.optString("body"),
                userAgent = userAgent,
                referer = referer,
                cookieHeader = cookie
            ),
            context.requestId
        ) ?: throw KSMHostException("IO_ERROR", "网易云请求失败。")
        if (response.body.toByteArray(Charsets.UTF_8).size > 8 * 1024 * 1024) {
            throw KSMHostException("RESOURCE_LIMIT", "响应过大。")
        }
        val cookies = JSONArray()
        for (header in response.headers) {
            if (!header.name.equals("set-cookie", ignoreCase = true)) {
                continue
            }
            cookies.put(header.value.substringBefore(';'))
        }
        return JSONObject()
            .put("status", response.status)
            .put("body", response.body)
            .put("cookies", cookies)
    }

    private fun ffmpegDetect(context: KSMPluginContext): Any {
        val tool = context.hostServices?.detectExternalTool("ffmpeg")
        if (tool?.valid == true) {
            return JSONObject()
                .put("available", true)
                .put("path", tool.path)
                .put("version", tool.version)
                .put("source", "environment")
                .put("error", JSONObject.NULL)
        }
        return JSONObject()
            .put("available", false)
            .put("path", JSONObject.NULL)
            .put("version", JSONObject.NULL)
            .put("source", "missing")
            .put("error", "未在环境变量或 PATH 中发现 FFmpeg")
    }

    private fun ffmpegValidate(
        context: KSMPluginContext,
        payload: JSONObject
    ): Any {
        val path = payload.optString("path").trim()
        if (path.isEmpty()) {
            throw KSMHostException("INVALID_ARGS", "path is required.")
        }
        val tool = context.hostServices?.validateExternalTool(path)
        val valid = tool?.valid == true
        return JSONObject()
            .put("available", valid)
            .put("path", path)
            .put("version", if (valid) tool?.version else JSONObject.NULL)
            .put("source", "manual")
            .put(
                "error",
                if (valid) JSONObject.NULL else "所选文件不是可用的 FFmpeg"
            )
    }

    private fun ffmpegSetPath(
        context: KSMPluginContext,
        payload: JSONObject
    ): Any {
        val host = context.hostServices ?: throw KSMHostException(
            "NOT_SUPPORTED",
            "The Android external tool service is not configured."
        )
        val path = payload.optString("path").trim()
        if (path.isNotEmpty() && host.validateExternalTool(path)?.valid != true) {
            throw KSMHostException(
                "INVALID_ARGS",
                "所选文件不是可用的 FFmpeg。"
            )
        }
        host.setExternalToolPath("ffmpeg", path)
        return ffmpegDetect(context)
    }

    private fun isAudioFile(name: String): Boolean {
        val extension = name.substringAfterLast('.', "").lowercase(Locale.US)
        return extension in AUDIO_EXTENSIONS
    }

    private fun readLimited(input: java.io.InputStream): ByteArray {
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(16 * 1024)
        var total = 0
        input.use { stream ->
            while (true) {
                val read = stream.read(buffer)
                if (read < 0) {
                    break
                }
                total += read
                if (total > MAX_COVER_BYTES) {
                    throw KSMHostException(
                        "RESOURCE_LIMIT",
                        "The cover image is too large."
                    )
                }
                output.write(buffer, 0, read)
            }
        }
        return output.toByteArray()
    }

    private fun sha256(bytes: ByteArray): String {
        return MessageDigest.getInstance("SHA-256")
            .digest(bytes)
            .joinToString("") { "%02x".format(it) }
    }

    private fun newId(prefix: String): String {
        return "$prefix-${System.currentTimeMillis().toString(36)}-" +
            idSequence.getAndIncrement().toString(36)
    }

    private fun dayKey(timestampMs: Long): String {
        return SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(timestampMs))
    }

    private fun dayStartMs(day: String): Long {
        return try {
            SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(day)?.time ?: 0L
        } catch (_: Exception) {
            0L
        }
    }

    private fun dayEndMs(day: String): Long {
        return dayStartMs(day) + 86_400_000L - 1L
    }

    private data class CoverFile(
        val path: String,
        val hash: String,
        val size: Long,
        val modifiedAt: Long?
    )

    companion object {
        const val COMMAND = "app.musicstorm.command"
        const val PERMISSION = "app.musicstorm"
        const val EVENT = "app.musicstorm.event"
        private const val MAX_COVER_BYTES = 16 * 1024 * 1024
        private val AUDIO_EXTENSIONS = setOf(
            "mp3", "flac", "wav", "m4a", "aac", "ogg", "opus", "wma", "ape"
        )
        private val SCHEMA = listOf(
            "CREATE TABLE IF NOT EXISTS library_folder (" +
                "id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, " +
                "display_name TEXT NOT NULL, recursive INTEGER NOT NULL DEFAULT 1, " +
                "track_count INTEGER NOT NULL DEFAULT 0, " +
                "last_scanned_at INTEGER NOT NULL, created_at INTEGER NOT NULL, " +
                "updated_at INTEGER NOT NULL, artist TEXT NOT NULL DEFAULT '', " +
                "cover_data TEXT)",
            "CREATE TABLE IF NOT EXISTS track (" +
                "id TEXT PRIMARY KEY, source TEXT NOT NULL, title TEXT NOT NULL, " +
                "artist TEXT NOT NULL, album TEXT NOT NULL, " +
                "duration_ms INTEGER NOT NULL DEFAULT 0, cover_url TEXT, " +
                "file_path TEXT, folder_id TEXT, lrc_path TEXT, bitrate INTEGER, " +
                "sample_rate INTEGER, channels INTEGER, added_at INTEGER NOT NULL, " +
                "updated_at INTEGER NOT NULL, content_hash TEXT, file_name TEXT)",
            "CREATE TABLE IF NOT EXISTS playlist (" +
                "id TEXT PRIMARY KEY, title TEXT NOT NULL, source TEXT NOT NULL, " +
                "folder_id TEXT, cover_url TEXT, created_at INTEGER NOT NULL)",
            "CREATE TABLE IF NOT EXISTS playlist_track (" +
                "playlist_id TEXT NOT NULL, track_id TEXT NOT NULL, " +
                "position INTEGER NOT NULL DEFAULT 0, " +
                "PRIMARY KEY (playlist_id, track_id))",
            "CREATE TABLE IF NOT EXISTS play_session (" +
                "id TEXT PRIMARY KEY, track_id TEXT NOT NULL, " +
                "source TEXT NOT NULL, started_at INTEGER NOT NULL, " +
                "ended_at INTEGER, listened_ms INTEGER NOT NULL DEFAULT 0, " +
                "completed INTEGER NOT NULL DEFAULT 0, device_id TEXT, " +
                "quality_br INTEGER, title TEXT, artist TEXT, album TEXT, " +
                "file_path TEXT, file_name TEXT, content_hash TEXT, cover_url TEXT)",
            "CREATE TABLE IF NOT EXISTS listen_daily (" +
                "day TEXT PRIMARY KEY, play_count INTEGER NOT NULL DEFAULT 0, " +
                "unique_tracks INTEGER NOT NULL DEFAULT 0, " +
                "total_ms INTEGER NOT NULL DEFAULT 0)",
            "CREATE TABLE IF NOT EXISTS app_setting (" +
                "key TEXT PRIMARY KEY, value TEXT NOT NULL)",
            "CREATE TABLE IF NOT EXISTS api_cache (" +
                "cache_key TEXT PRIMARY KEY, body TEXT NOT NULL, " +
                "created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)",
            "CREATE TABLE IF NOT EXISTS listen_day_track (" +
                "day TEXT NOT NULL, track_id TEXT NOT NULL, " +
                "PRIMARY KEY (day, track_id))",
            "CREATE TABLE IF NOT EXISTS local_playlist_entry (" +
                "playlist_id TEXT NOT NULL, track_id TEXT NOT NULL, " +
                "added_at INTEGER NOT NULL, anchor_track_id TEXT, " +
                "anchor_cover TEXT, PRIMARY KEY (playlist_id, track_id))",
            "CREATE INDEX IF NOT EXISTS idx_track_folder ON track(folder_id)",
            "CREATE INDEX IF NOT EXISTS idx_session_started " +
                "ON play_session(started_at)",
            "CREATE INDEX IF NOT EXISTS idx_session_track " +
                "ON play_session(track_id)",
            "CREATE INDEX IF NOT EXISTS idx_track_hash ON track(content_hash)",
            "CREATE INDEX IF NOT EXISTS idx_track_file_name ON track(file_name)",
            "CREATE INDEX IF NOT EXISTS idx_local_entry_track " +
                "ON local_playlist_entry(track_id)",
            "CREATE INDEX IF NOT EXISTS idx_api_cache_expires " +
                "ON api_cache(expires_at)"
        )
    }
}
