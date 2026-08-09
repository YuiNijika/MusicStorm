use serde::Deserialize;
use tauri::{AppHandle, Emitter, State};

const PLAYER_COMMAND_EVENT: &str = "musicstorm:player-command";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NowPlayingPayload {
    title: String,
    artist: String,
    album: String,
    duration_ms: f64,
    position_ms: f64,
    is_playing: bool,
    queue_index: usize,
    queue_count: usize,
    cover_path: Option<String>,
}

#[cfg(target_os = "macos")]
mod platform {
    use super::*;
    use mediaplayer::{
        Artwork, CommandToken, HandlerStatus, NowPlayingInfo, NowPlayingInfoCenter,
        NowPlayingMediaType, PlaybackState, RemoteCommandCenter,
    };
    use serde::Serialize;
    use std::sync::Mutex;

    #[derive(Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct PlayerCommandPayload {
        action: String,
        position_ms: Option<f64>,
    }

    struct ArtworkCache {
        path: Option<String>,
        artwork: Option<Artwork>,
    }

    impl ArtworkCache {
        fn new() -> Self {
            Self {
                path: None,
                artwork: None,
            }
        }

        fn resolve(&mut self, path: Option<&str>) -> Option<Artwork> {
            let normalized = path.map(str::trim).filter(|value| !value.is_empty());
            if self.path.as_deref() == normalized {
                return self.artwork.clone();
            }

            self.path = normalized.map(ToOwned::to_owned);
            self.artwork = normalized.and_then(|value| Artwork::from_path(value).ok());
            self.artwork.clone()
        }
    }

    pub struct NowPlayingState {
        center: NowPlayingInfoCenter,
        _tokens: Mutex<Vec<CommandToken>>,
        artwork: Mutex<ArtworkCache>,
    }

    fn emit_action(app: &AppHandle, action: &str, position_ms: Option<f64>) -> HandlerStatus {
        let payload = PlayerCommandPayload {
            action: action.to_string(),
            position_ms,
        };
        match app.emit(PLAYER_COMMAND_EVENT, payload) {
            Ok(()) => HandlerStatus::Success,
            Err(_) => HandlerStatus::CommandFailed,
        }
    }

    fn action_handler(
        app: &AppHandle,
        action: &'static str,
    ) -> impl FnMut(mediaplayer::CommandEvent) -> HandlerStatus + Send + 'static {
        let app = app.clone();
        move |_| emit_action(&app, action, None)
    }

    pub fn setup(app: &AppHandle) -> NowPlayingState {
        let remote = RemoteCommandCenter::shared();

        remote.play_command().set_enabled(false);
        remote.pause_command().set_enabled(false);
        remote.toggle_play_pause_command().set_enabled(false);
        remote.next_track_command().set_enabled(false);
        remote.previous_track_command().set_enabled(false);
        remote.skip_forward_command().set_enabled(false);
        remote.skip_backward_command().set_enabled(false);
        remote.change_playback_position_command().set_enabled(false);
        remote
            .skip_forward_command()
            .set_preferred_intervals(&[15.0]);
        remote
            .skip_backward_command()
            .set_preferred_intervals(&[15.0]);

        let seek_app = app.clone();
        let seek_token = remote.on_change_playback_position(move |event| {
            let Some(seconds) = event.position.filter(|value| value.is_finite()) else {
                return HandlerStatus::NoActionableNowPlayingItem;
            };
            emit_action(
                &seek_app,
                "seek-to",
                Some((seconds.max(0.0) * 1000.0).round()),
            )
        });

        let skip_forward_app = app.clone();
        let skip_forward_token = remote.on_skip_forward(move |event| {
            emit_action(
                &skip_forward_app,
                "seek-forward",
                event
                    .skip_interval
                    .filter(|value| value.is_finite())
                    .map(|seconds| (seconds.max(0.0) * 1000.0).round()),
            )
        });

        let skip_backward_app = app.clone();
        let skip_backward_token = remote.on_skip_backward(move |event| {
            emit_action(
                &skip_backward_app,
                "seek-backward",
                event
                    .skip_interval
                    .filter(|value| value.is_finite())
                    .map(|seconds| (seconds.max(0.0) * 1000.0).round()),
            )
        });

        let tokens = vec![
            remote.on_play(action_handler(app, "play")),
            remote.on_pause(action_handler(app, "pause")),
            remote.on_toggle_play_pause(action_handler(app, "toggle")),
            remote.on_next_track(action_handler(app, "next")),
            remote.on_previous_track(action_handler(app, "previous")),
            skip_forward_token,
            skip_backward_token,
            seek_token,
        ];

        NowPlayingState {
            center: NowPlayingInfoCenter::default_center(),
            _tokens: Mutex::new(tokens),
            artwork: Mutex::new(ArtworkCache::new()),
        }
    }

    impl NowPlayingState {
        pub(super) fn update(&self, payload: NowPlayingPayload) -> Result<(), String> {
            let duration = finite_non_negative(payload.duration_ms) / 1000.0;
            let position = (finite_non_negative(payload.position_ms) / 1000.0).min(duration);
            let queue_count = u64::try_from(payload.queue_count).unwrap_or(u64::MAX);
            let queue_index = u64::try_from(payload.queue_index).unwrap_or(0);
            let has_duration = duration > 0.0;
            let has_multiple_tracks = payload.queue_count > 1;

            let remote = RemoteCommandCenter::shared();
            remote.play_command().set_enabled(!payload.is_playing);
            remote.pause_command().set_enabled(payload.is_playing);
            remote.toggle_play_pause_command().set_enabled(true);
            remote.next_track_command().set_enabled(has_multiple_tracks);
            remote
                .previous_track_command()
                .set_enabled(has_multiple_tracks);
            remote.skip_forward_command().set_enabled(has_duration);
            remote.skip_backward_command().set_enabled(has_duration);
            remote
                .change_playback_position_command()
                .set_enabled(has_duration);

            let info = NowPlayingInfo::new()
                .title(payload.title)
                .artist(payload.artist)
                .album_title(payload.album)
                .playback_duration(duration)
                .elapsed_playback_time(position)
                .playback_rate(if payload.is_playing { 1.0 } else { 0.0 })
                .default_playback_rate(1.0)
                .playback_queue_index(queue_index)
                .playback_queue_count(queue_count)
                .media_type(NowPlayingMediaType::Audio);

            let artwork = self
                .artwork
                .lock()
                .map_err(|_| "now playing artwork lock".to_string())?
                .resolve(payload.cover_path.as_deref());
            self.center
                .set_now_playing_info_with_artwork(&info, artwork.as_ref());
            self.center.set_playback_state(if payload.is_playing {
                PlaybackState::Playing
            } else {
                PlaybackState::Paused
            });
            Ok(())
        }

        pub(super) fn clear(&self) {
            let remote = RemoteCommandCenter::shared();
            remote.play_command().set_enabled(false);
            remote.pause_command().set_enabled(false);
            remote.toggle_play_pause_command().set_enabled(false);
            remote.next_track_command().set_enabled(false);
            remote.previous_track_command().set_enabled(false);
            remote.skip_forward_command().set_enabled(false);
            remote.skip_backward_command().set_enabled(false);
            remote.change_playback_position_command().set_enabled(false);
            self.center.set_playback_state(PlaybackState::Stopped);
            self.center.clear();
        }
    }

    fn finite_non_negative(value: f64) -> f64 {
        if value.is_finite() {
            value.max(0.0)
        } else {
            0.0
        }
    }

    #[cfg(test)]
    mod tests {
        use super::finite_non_negative;

        #[test]
        fn time_values_are_safe_for_media_player() {
            assert_eq!(finite_non_negative(-5.0), 0.0);
            assert_eq!(finite_non_negative(f64::NAN), 0.0);
            assert_eq!(finite_non_negative(2500.0), 2500.0);
        }
    }
}

#[cfg(target_os = "macos")]
pub use platform::{setup, NowPlayingState};

#[cfg(target_os = "macos")]
#[tauri::command]
pub fn macos_now_playing_update(
    state: State<'_, NowPlayingState>,
    payload: NowPlayingPayload,
) -> Result<(), String> {
    state.update(payload)
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub fn macos_now_playing_clear(state: State<'_, NowPlayingState>) {
    state.clear();
}
