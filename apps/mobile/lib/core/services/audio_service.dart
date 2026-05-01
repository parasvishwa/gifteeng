import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';

/// Singleton audio service — plays SFX from assets/sfx/.
/// Always call [init] once at app start (in main.dart or shell).
class AudioService {
  AudioService._();
  static final AudioService instance = AudioService._();

  final _player  = AudioPlayer();
  final _player2 = AudioPlayer(); // second channel for overlaps
  bool _muted = false;

  bool get muted => _muted;
  void toggleMute() => _muted = !_muted;
  void setMute(bool v) => _muted = v;

  Future<void> _play(String asset, {AudioPlayer? player}) async {
    if (_muted) return;
    try {
      final p = player ?? _player;
      await p.stop();
      await p.play(AssetSource('sfx/$asset'));
    } catch (e) {
      debugPrint('AudioService error: $e');
    }
  }

  // ─── UI micro-interactions ────────────────────────────────────────────────
  Future<void> tap()         => _play('button_tap.wav');

  // ─── Game sounds ──────────────────────────────────────────────────────────
  Future<void> scratch()     => _play('scratch.wav');
  Future<void> coinCollect() => _play('coin_collect.wav', player: _player2);
  Future<void> slotWin()     => _play('slot_win.wav');
  Future<void> bonus()       => _play('bonus.wav');

  // ─── Win / Achievement ────────────────────────────────────────────────────
  Future<void> winJingle()   => _play('win_jingle.wav');
  Future<void> achievement() => _play('achievement.wav');
  Future<void> unlock()      => _play('unlock.wav');

  Future<void> dispose() async {
    await _player.dispose();
    await _player2.dispose();
  }
}
