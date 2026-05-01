// ─── Full Sticker Album ───────────────────────────────────────────────────────
//
// Rich collectibles experience. 24 stickers across 4 themed volumes, 5 rarity
// tiers (Common → Mythic). Users earn packs from games, open them to reveal
// stickers with flip + confetti animations. Duplicates convert to Goins.
// Completing a volume unlocks a mystery prize chip. Share-the-album uses a
// screenshot + native share sheet.
//
// Backend (same data web will use when super admin ships it):
//   GET  /stickers/catalog        → [{id, emoji, name, volume, rarity}]
//   GET  /stickers/user           → {owned: {id: count}, packs: N, coinsEarned}
//   POST /stickers/open-pack      → {revealed: [{id, isNew, duplicateCoins}]}
//   POST /stickers/claim-volume   → {coins: N, prize: '...'}
//
// Until endpoints ship we persist to SharedPreferences so the feature works
// today. A single flip of `_backendEnabled = true` (see bottom) swaps to API.
//
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:convert';
import 'dart:math' as math;

import 'package:confetti/confetti.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:screenshot/screenshot.dart';
import 'package:share_plus/share_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../../core/api/api_client.dart';
import '../../../../core/analytics/analytics_service.dart';
import '../../../../core/widgets/coin_fly.dart';

// ─── Design tokens ────────────────────────────────────────────────────────────

const _kBg      = Color(0xFF080C12);
const _kCard    = Color(0xFF0F1420);
const _kCard2   = Color(0xFF141B28);
const _kBorder  = Color(0xFF1C2333);
const _kText0   = Color(0xFFF0F4FF);
const _kText1   = Color(0xFF8892AA);
const _kText2   = Color(0xFF4A5068);
const _kGold    = Color(0xFFFFC857);
const _kViolet  = Color(0xFF8B5CF6);

// ─── Catalog ──────────────────────────────────────────────────────────────────

enum Rarity { common, rare, epic, legendary, mythic }

extension RarityX on Rarity {
  String get label => switch (this) {
    Rarity.common    => 'Common',
    Rarity.rare      => 'Rare',
    Rarity.epic      => 'Epic',
    Rarity.legendary => 'Legendary',
    Rarity.mythic    => 'Mythic',
  };

  Color get tint => switch (this) {
    Rarity.common    => const Color(0xFF64748B), // slate
    Rarity.rare      => const Color(0xFF3B82F6), // blue
    Rarity.epic      => const Color(0xFF8B5CF6), // violet
    Rarity.legendary => const Color(0xFFFFC857), // gold
    Rarity.mythic    => const Color(0xFFEC4899), // pink (rainbow companion)
  };

  List<Color> get gradient => switch (this) {
    Rarity.common    => [const Color(0xFF475569), const Color(0xFF1E293B)],
    Rarity.rare      => [const Color(0xFF60A5FA), const Color(0xFF1E40AF)],
    Rarity.epic      => [const Color(0xFFA78BFA), const Color(0xFF6D28D9)],
    Rarity.legendary => [const Color(0xFFFFD76A), const Color(0xFFB45309)],
    Rarity.mythic    => [
        const Color(0xFFFF6EC7),
        const Color(0xFF8B5CF6),
        const Color(0xFF3B82F6),
      ],
  };

  /// Coins received for a duplicate of this rarity.
  int get duplicateCoins => switch (this) {
    Rarity.common    => 5,
    Rarity.rare      => 12,
    Rarity.epic      => 30,
    Rarity.legendary => 75,
    Rarity.mythic    => 150,
  };
}

class StickerDef {
  final String id;
  final String emoji;
  final String name;
  final String volume;
  final Rarity rarity;
  const StickerDef({
    required this.id,
    required this.emoji,
    required this.name,
    required this.volume,
    required this.rarity,
  });
}

const _kCatalog = <StickerDef>[
  // ── Volume 1: Festive Spirit
  StickerDef(id: 'f01', emoji: '🪔', name: 'Diya',        volume: 'Festive Spirit', rarity: Rarity.common),
  StickerDef(id: 'f02', emoji: '🎆', name: 'Fireworks',   volume: 'Festive Spirit', rarity: Rarity.common),
  StickerDef(id: 'f03', emoji: '🎁', name: 'Gift Box',    volume: 'Festive Spirit', rarity: Rarity.common),
  StickerDef(id: 'f04', emoji: '🌺', name: 'Marigold',    volume: 'Festive Spirit', rarity: Rarity.rare),
  StickerDef(id: 'f05', emoji: '🎇', name: 'Sparkler',    volume: 'Festive Spirit', rarity: Rarity.rare),
  StickerDef(id: 'f06', emoji: '🏮', name: 'Lantern',     volume: 'Festive Spirit', rarity: Rarity.epic),

  // ── Volume 2: Love & Romance
  StickerDef(id: 'l01', emoji: '🌹', name: 'Rose',         volume: 'Love & Romance', rarity: Rarity.common),
  StickerDef(id: 'l02', emoji: '💘', name: 'Heart Arrow',  volume: 'Love & Romance', rarity: Rarity.common),
  StickerDef(id: 'l03', emoji: '💐', name: 'Bouquet',      volume: 'Love & Romance', rarity: Rarity.common),
  StickerDef(id: 'l04', emoji: '💍', name: 'Ring',         volume: 'Love & Romance', rarity: Rarity.rare),
  StickerDef(id: 'l05', emoji: '💋', name: 'Kiss',         volume: 'Love & Romance', rarity: Rarity.rare),
  StickerDef(id: 'l06', emoji: '💝', name: 'Heart Gift',   volume: 'Love & Romance', rarity: Rarity.epic),

  // ── Volume 3: Celebration
  StickerDef(id: 'c01', emoji: '🎂', name: 'Cake',         volume: 'Celebration',    rarity: Rarity.common),
  StickerDef(id: 'c02', emoji: '🎉', name: 'Party Popper', volume: 'Celebration',    rarity: Rarity.common),
  StickerDef(id: 'c03', emoji: '🎈', name: 'Balloon',      volume: 'Celebration',    rarity: Rarity.common),
  StickerDef(id: 'c04', emoji: '🍾', name: 'Champagne',    volume: 'Celebration',    rarity: Rarity.rare),
  StickerDef(id: 'c05', emoji: '🎊', name: 'Confetti Ball',volume: 'Celebration',    rarity: Rarity.rare),
  StickerDef(id: 'c06', emoji: '🏆', name: 'Trophy',       volume: 'Celebration',    rarity: Rarity.epic),

  // ── Volume 4: Mystic Legends
  StickerDef(id: 'm01', emoji: '⭐', name: 'Star',         volume: 'Mystic Legends', rarity: Rarity.rare),
  StickerDef(id: 'm02', emoji: '✨', name: 'Sparkles',     volume: 'Mystic Legends', rarity: Rarity.rare),
  StickerDef(id: 'm03', emoji: '🔮', name: 'Crystal Ball', volume: 'Mystic Legends', rarity: Rarity.epic),
  StickerDef(id: 'm04', emoji: '🦄', name: 'Unicorn',      volume: 'Mystic Legends', rarity: Rarity.epic),
  StickerDef(id: 'm05', emoji: '🐉', name: 'Dragon',       volume: 'Mystic Legends', rarity: Rarity.legendary),
  StickerDef(id: 'm06', emoji: '👑', name: 'Crown',        volume: 'Mystic Legends', rarity: Rarity.mythic),
];

// ─── State ────────────────────────────────────────────────────────────────────

class AlbumState {
  final Map<String, int> owned;      // id → count
  final int packs;
  final int coinsEarned;
  final Set<String> claimedVolumes;  // volume names already redeemed
  const AlbumState({
    required this.owned,
    required this.packs,
    required this.coinsEarned,
    required this.claimedVolumes,
  });

  AlbumState copyWith({
    Map<String, int>? owned,
    int? packs,
    int? coinsEarned,
    Set<String>? claimedVolumes,
  }) => AlbumState(
    owned: owned ?? this.owned,
    packs: packs ?? this.packs,
    coinsEarned: coinsEarned ?? this.coinsEarned,
    claimedVolumes: claimedVolumes ?? this.claimedVolumes,
  );

  int get uniqueCollected => owned.keys.length;
  int get totalAvailable  => _kCatalog.length;
  double get progress     => totalAvailable == 0 ? 0 : uniqueCollected / totalAvailable;
  int get totalDuplicates => owned.values.fold(0, (a, b) => a + (b > 1 ? b - 1 : 0));
}

class AlbumNotifier extends StateNotifier<AlbumState> {
  AlbumNotifier(this._ref) : super(const AlbumState(
    owned: {}, packs: 3, coinsEarned: 0, claimedVolumes: {},
  )) {
    _hydrate();
  }

  final Ref _ref;

  static const _kOwnedKey   = 'stickers.owned.v1';
  static const _kPacksKey   = 'stickers.packs.v1';
  static const _kCoinsKey   = 'stickers.coins.v1';
  static const _kClaimedKey = 'stickers.claimed.v1';

  /// Hydrate: try backend first, then fall back to SharedPreferences.
  /// Backend is source-of-truth when reachable; local state keeps the app
  /// usable offline or before login.
  Future<void> _hydrate() async {
    // ── 1. Load local state first (immediate first paint)
    final sp = await SharedPreferences.getInstance();
    final ownedJson = sp.getString(_kOwnedKey);
    Map<String, int> owned = {};
    if (ownedJson != null) {
      try {
        final map = jsonDecode(ownedJson) as Map;
        owned = map.map((k, v) => MapEntry(k.toString(), (v as num).toInt()));
      } catch (_) {}
    }
    final packs = sp.getInt(_kPacksKey) ?? 3;
    final coins = sp.getInt(_kCoinsKey) ?? 0;
    final claimed = (sp.getStringList(_kClaimedKey) ?? []).toSet();
    state = AlbumState(
      owned: owned, packs: packs,
      coinsEarned: coins, claimedVolumes: claimed,
    );

    // ── 2. Try backend in the background; overwrite local if authed
    try {
      final dio = _ref.read(dioProvider);
      final res = await dio.get('/stickers/user');
      final data = res.data;
      if (data is Map) {
        final ownedRaw = data['owned'];
        final Map<String, int> remoteOwned = {};
        if (ownedRaw is Map) {
          ownedRaw.forEach((k, v) {
            if (v is num) remoteOwned[k.toString()] = v.toInt();
          });
        }
        final claimedRaw = data['claimedVolumes'];
        final Set<String> remoteClaimed = claimedRaw is List
            ? claimedRaw.map((e) => e.toString()).toSet()
            : {};
        state = AlbumState(
          owned:          remoteOwned,
          packs:          (data['packs']       as num?)?.toInt() ?? state.packs,
          coinsEarned:    (data['coinsEarned'] as num?)?.toInt() ?? state.coinsEarned,
          claimedVolumes: remoteClaimed,
        );
        await _persist();
      }
    } catch (_) {
      // Unauthenticated or backend offline — stay with local state.
    }
  }

  Future<void> _persist() async {
    final sp = await SharedPreferences.getInstance();
    await sp.setString(_kOwnedKey, jsonEncode(state.owned));
    await sp.setInt(_kPacksKey, state.packs);
    await sp.setInt(_kCoinsKey, state.coinsEarned);
    await sp.setStringList(_kClaimedKey, state.claimedVolumes.toList());
  }

  /// Open a pack. Tries backend (POST /stickers/open-pack) first; falls
  /// back to client-side weighted RNG if the call fails (offline/unauth).
  /// Returns a list of revealed stickers with `isNew` + `duplicateCoins`.
  // ignore: library_private_types_in_public_api
  Future<List<_RevealResult>> openPack() async {
    if (state.packs <= 0) return const [];

    // ── 1. Try backend
    try {
      final dio = _ref.read(dioProvider);
      final res = await dio.post('/stickers/open-pack');
      final data = res.data;
      if (data is Map && data['revealed'] is List) {
        final revealed = data['revealed'] as List;
        final out = <_RevealResult>[];
        final nextOwned = Map<String, int>.from(state.owned);
        for (final raw in revealed) {
          if (raw is! Map) continue;
          final id = (raw['id'] ?? raw['code'] ?? '').toString();
          if (id.isEmpty) continue;
          // Rehydrate a StickerDef from the backend payload directly so we
          // don't depend on the local catalog having a matching entry.
          final def = StickerDef(
            id:     id,
            emoji:  (raw['emoji']  ?? '✨').toString(),
            name:   (raw['name']   ?? 'Sticker').toString(),
            volume: (raw['volume'] ?? 'Festive Spirit').toString(),
            rarity: _rarityFromString(raw['rarity']?.toString()),
          );
          final isNew = raw['isNew'] == true;
          final dupCoins = (raw['duplicateCoins'] as num?)?.toInt() ?? 0;
          nextOwned[id] = (nextOwned[id] ?? 0) + 1;
          out.add(_RevealResult(
            sticker:        def,
            isNew:          isNew,
            duplicateCoins: dupCoins,
          ));
        }
        state = state.copyWith(
          owned:       nextOwned,
          packs:       (data['packsRemaining'] as num?)?.toInt() ?? (state.packs - 1),
          coinsEarned: (data['coinsEarned']    as num?)?.toInt() ?? state.coinsEarned,
        );
        _persist();
        return out;
      }
    } catch (_) {
      // Fall through to local fallback
    }

    // ── 2. Local fallback (offline / backend down / pre-login)
    final rng = math.Random();
    final out = <_RevealResult>[];
    final nextOwned = Map<String, int>.from(state.owned);
    int bonusCoins = 0;

    for (int i = 0; i < 3; i++) {
      final roll = rng.nextDouble();
      final Rarity r;
      if      (roll < 0.55) { r = Rarity.common;    }
      else if (roll < 0.80) { r = Rarity.rare;      }
      else if (roll < 0.94) { r = Rarity.epic;      }
      else if (roll < 0.99) { r = Rarity.legendary; }
      else                  { r = Rarity.mythic;    }

      final pool = _kCatalog.where((s) => s.rarity == r).toList();
      final pick = pool[rng.nextInt(pool.length)];
      final wasOwned = (nextOwned[pick.id] ?? 0) > 0;
      nextOwned[pick.id] = (nextOwned[pick.id] ?? 0) + 1;
      final dupCoins = wasOwned ? r.duplicateCoins : 0;
      if (dupCoins > 0) bonusCoins += dupCoins;
      out.add(_RevealResult(
        sticker: pick,
        isNew: !wasOwned,
        duplicateCoins: dupCoins,
      ));
    }

    state = state.copyWith(
      owned:       nextOwned,
      packs:       state.packs - 1,
      coinsEarned: state.coinsEarned + bonusCoins,
    );
    _persist();
    return out;
  }

  /// Parse a rarity string from the backend into a local Rarity enum.
  static Rarity _rarityFromString(String? s) {
    switch ((s ?? '').toLowerCase()) {
      case 'mythic':    return Rarity.mythic;
      case 'legendary': return Rarity.legendary;
      case 'epic':      return Rarity.epic;
      case 'rare':      return Rarity.rare;
      default:          return Rarity.common;
    }
  }

  /// Claim the mystery prize for a completed volume.
  /// Tries backend first (POST /stickers/claim-volume) — falls back to
  /// local award if backend unavailable. Returns the prize amount (0 if
  /// already claimed or volume incomplete).
  Future<int> claimVolume(String volume) async {
    if (state.claimedVolumes.contains(volume)) return 0;
    final vol = _kCatalog.where((s) => s.volume == volume);
    final complete = vol.every((s) => (state.owned[s.id] ?? 0) > 0);
    if (!complete) return 0;

    // ── 1. Try backend
    try {
      final dio = _ref.read(dioProvider);
      final res = await dio.post('/stickers/claim-volume', data: {'volume': volume});
      final data = res.data;
      if (data is Map) {
        final prize = (data['coins'] as num?)?.toInt() ?? 500;
        state = state.copyWith(
          claimedVolumes: {...state.claimedVolumes, volume},
          coinsEarned: state.coinsEarned + prize,
        );
        _persist();
        return prize;
      }
    } catch (_) {
      // Fall through
    }

    // ── 2. Local fallback
    const prize = 500;
    state = state.copyWith(
      claimedVolumes: {...state.claimedVolumes, volume},
      coinsEarned: state.coinsEarned + prize,
    );
    _persist();
    return prize;
  }

  /// Debug / dev convenience: grant a pack (e.g. from a game win).
  void grantPack([int n = 1]) {
    state = state.copyWith(packs: state.packs + n);
    _persist();
  }
}

final albumProvider =
    StateNotifierProvider<AlbumNotifier, AlbumState>((ref) => AlbumNotifier(ref));

class _RevealResult {
  final StickerDef sticker;
  final bool isNew;
  final int duplicateCoins;
  const _RevealResult({
    required this.sticker,
    required this.isNew,
    required this.duplicateCoins,
  });
}

// ─── Screen ───────────────────────────────────────────────────────────────────

class StickerAlbumScreen extends ConsumerStatefulWidget {
  const StickerAlbumScreen({super.key});

  @override
  ConsumerState<StickerAlbumScreen> createState() => _StickerAlbumScreenState();
}

class _StickerAlbumScreenState extends ConsumerState<StickerAlbumScreen> {
  final _shotCtrl = ScreenshotController();

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(albumProvider);
    final volumes = <String>{for (final s in _kCatalog) s.volume}.toList();

    return Scaffold(
      backgroundColor: _kBg,
      body: Screenshot(
        controller: _shotCtrl,
        child: CustomScrollView(
          slivers: [
            SliverAppBar(
              backgroundColor: _kBg,
              foregroundColor: _kText0,
              pinned: true,
              elevation: 0,
              leading: IconButton(
                icon: const Icon(Icons.arrow_back_rounded),
                onPressed: () {
                  if (context.canPop()) {
                    context.pop();
                  } else {
                    context.go('/play');
                  }
                },
              ),
              title: Text('Sticker Album', style: GoogleFonts.inter(
                fontSize: 18, fontWeight: FontWeight.w800, color: _kText0,
              )),
              actions: [
                IconButton(
                  tooltip: 'Share album',
                  icon: const Icon(Icons.ios_share_rounded, size: 20),
                  onPressed: _shareAlbum,
                ),
                const Gap(4),
              ],
            ),

            SliverToBoxAdapter(child: _ProgressHero(state: state)),
            const SliverToBoxAdapter(child: Gap(18)),
            SliverToBoxAdapter(child: _PackShelf(
              packs: state.packs,
              onOpen: _openPackFlow,
            )),
            const SliverToBoxAdapter(child: Gap(22)),

            // Themed volumes
            for (final v in volumes) ...[
              SliverToBoxAdapter(child: _VolumeHeader(
                volume: v,
                state: state,
                onClaim: () => _claimVolume(v),
              )),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 24),
                sliver: SliverGrid(
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 3,
                    mainAxisSpacing: 10,
                    crossAxisSpacing: 10,
                    childAspectRatio: 0.82,
                  ),
                  delegate: SliverChildBuilderDelegate((ctx, i) {
                    final stickers = _kCatalog.where((s) => s.volume == v).toList();
                    final s = stickers[i];
                    return _StickerTile(
                      def: s,
                      count: state.owned[s.id] ?? 0,
                      onTap: () => _showStickerDetail(s, state.owned[s.id] ?? 0),
                    ).animate().fadeIn(delay: (i * 40).ms).slideY(begin: 0.1);
                  },
                    childCount: _kCatalog.where((s) => s.volume == v).length,
                  ),
                ),
              ),
            ],

            SliverToBoxAdapter(child: _EarnedCoinsFooter(coins: state.coinsEarned)),
            const SliverToBoxAdapter(child: Gap(36)),
          ],
        ),
      ),
    );
  }

  // ── Pack opening flow ───────────────────────────────────────────────────────
  Future<void> _openPackFlow() async {
    final state = ref.read(albumProvider);
    if (state.packs <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No packs yet — play games to earn packs!'),
          backgroundColor: _kCard2,
        ),
      );
      return;
    }
    HapticFeedback.mediumImpact();
    Analytics.track('pack_open_start');
    final results = await ref.read(albumProvider.notifier).openPack();
    Analytics.track('pack_open_done', {
      'revealed': results.length,
      'newStickers': results.where((r) => r.isNew).length,
      'duplicateCoins': results.fold<int>(0, (a, b) => a + b.duplicateCoins),
    });
    if (results.isEmpty) return;
    if (!mounted) return;
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      isDismissible: false,
      enableDrag: false,
      builder: (_) => _PackRevealSheet(results: results),
    );
  }

  // ── Sticker detail ──────────────────────────────────────────────────────────
  void _showStickerDetail(StickerDef s, int count) {
    HapticFeedback.selectionClick();
    showModalBottomSheet(
      context: context,
      backgroundColor: _kCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (_) => _StickerDetailSheet(def: s, count: count),
    );
  }

  // ── Claim volume prize ──────────────────────────────────────────────────────
  Future<void> _claimVolume(String v) async {
    final prize = await ref.read(albumProvider.notifier).claimVolume(v);
    if (prize <= 0) return;
    if (!mounted) return;
    HapticFeedback.heavyImpact();
    showDialog(
      context: context,
      builder: (ctx) => _VolumePrizeDialog(volume: v, coins: prize),
    ).then((_) {
      // After the dialog closes: burst coins from screen center to balance chip.
      if (!mounted) return;
      final size = MediaQuery.of(context).size;
      CoinFly.burst(
        context,
        from: Offset(size.width / 2, size.height / 2),
        amount: (prize / 50).clamp(8, 20).toInt(),
      );
    });
  }

  // ── Share album ─────────────────────────────────────────────────────────────
  Future<void> _shareAlbum() async {
    HapticFeedback.selectionClick();
    try {
      final bytes = await _shotCtrl.capture(pixelRatio: 2.5);
      if (bytes == null) return;
      final state = ref.read(albumProvider);
      await Share.shareXFiles(
        [XFile.fromData(bytes, mimeType: 'image/png', name: 'gifteeng-album.png')],
        text: 'I\'ve collected ${state.uniqueCollected}/${state.totalAvailable} Gifteeng stickers! 📖✨',
      );
    } catch (_) {}
  }
}

// ─── Progress hero ────────────────────────────────────────────────────────────

class _ProgressHero extends StatelessWidget {
  final AlbumState state;
  const _ProgressHero({required this.state});

  @override
  Widget build(BuildContext context) {
    final rarityCounts = <Rarity, int>{};
    for (final s in _kCatalog) {
      if ((state.owned[s.id] ?? 0) > 0) {
        rarityCounts[s.rarity] = (rarityCounts[s.rarity] ?? 0) + 1;
      }
    }

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 4, 16, 0),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: _kCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _kViolet.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          _ProgressRing(progress: state.progress),
          const Gap(18),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Your Collection', style: GoogleFonts.inter(
                  fontSize: 13, fontWeight: FontWeight.w600,
                  color: _kText1, letterSpacing: 0.3,
                )),
                const Gap(4),
                Text.rich(
                  TextSpan(
                    style: GoogleFonts.inter(
                      fontSize: 26, fontWeight: FontWeight.w800, color: _kText0,
                    ),
                    children: [
                      TextSpan(text: '${state.uniqueCollected}'),
                      TextSpan(
                        text: ' / ${state.totalAvailable}',
                        style: const TextStyle(color: _kText2, fontSize: 20),
                      ),
                    ],
                  ),
                ),
                const Gap(10),
                Wrap(
                  spacing: 6, runSpacing: 6,
                  children: Rarity.values.map((r) => _rarityPill(
                    r, rarityCounts[r] ?? 0,
                    _kCatalog.where((s) => s.rarity == r).length,
                  )).toList(),
                ),
              ],
            ),
          ),
        ],
      ),
    ).animate().fadeIn().scale(begin: const Offset(0.97, 0.97));
  }

  Widget _rarityPill(Rarity r, int owned, int total) {
    final hasAny = owned > 0;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: hasAny ? r.tint.withValues(alpha: 0.18) : _kCard2,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: hasAny ? r.tint.withValues(alpha: 0.45) : _kBorder,
        ),
      ),
      child: Text(
        '${r.label}  $owned/$total',
        style: GoogleFonts.inter(
          fontSize: 9.5, fontWeight: FontWeight.w700,
          color: hasAny ? r.tint : _kText2, letterSpacing: 0.2,
        ),
      ),
    );
  }
}

class _ProgressRing extends StatelessWidget {
  final double progress;
  const _ProgressRing({required this.progress});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 86, height: 86,
      child: TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: progress),
        duration: 900.ms,
        curve: Curves.easeOutCubic,
        builder: (_, v, __) => CustomPaint(
          painter: _RingPainter(v),
          child: Center(
            child: Text('${(v * 100).round()}%',
              style: GoogleFonts.inter(
                fontSize: 17, fontWeight: FontWeight.w800, color: _kText0)),
          ),
        ),
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  final double progress;
  _RingPainter(this.progress);

  @override
  void paint(Canvas c, Size s) {
    final center = Offset(s.width / 2, s.height / 2);
    final radius = s.width / 2 - 5;
    final bg = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 8
      ..color = _kCard2;
    c.drawCircle(center, radius, bg);

    final grad = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 8
      ..strokeCap = StrokeCap.round
      ..color = const Color(0xFFEF3752); // brand red — no BuildContext in CustomPainter
    c.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      -math.pi / 2,
      2 * math.pi * progress.clamp(0.0, 1.0),
      false, grad,
    );
  }

  @override
  bool shouldRepaint(covariant _RingPainter old) => old.progress != progress;
}

// ─── Pack shelf ───────────────────────────────────────────────────────────────

class _PackShelf extends StatelessWidget {
  final int packs;
  final VoidCallback onOpen;
  const _PackShelf({required this.packs, required this.onOpen});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text('📦', style: TextStyle(fontSize: 18)),
              const Gap(8),
              Text('Unopened Packs', style: GoogleFonts.inter(
                fontSize: 16, fontWeight: FontWeight.w800, color: _kText0,
              )),
              const Spacer(),
              Text(packs == 0 ? 'Play to earn packs' : '$packs available',
                style: GoogleFonts.inter(
                  fontSize: 11, fontWeight: FontWeight.w600, color: _kText1)),
            ],
          ),
          const Gap(12),
          SizedBox(
            height: 140,
            child: packs <= 0
                ? _EmptyPackState()
                : ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: packs.clamp(0, 5),
                    separatorBuilder: (_, __) => const Gap(12),
                    itemBuilder: (_, i) => _PackCard(onOpen: onOpen, index: i),
                  ),
          ),
        ],
      ),
    );
  }
}

class _PackCard extends StatelessWidget {
  final VoidCallback onOpen;
  final int index;
  const _PackCard({required this.onOpen, required this.index});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onOpen,
      child: Container(
        width: 110,
        decoration: BoxDecoration(
          color: _kViolet,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Stack(
          children: [
            Positioned(
              top: -8, right: -8,
              child: Text('✨',
                style: TextStyle(fontSize: 48,
                  color: Colors.white.withValues(alpha: 0.3))),
            ),
            Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Text('🎴', style: TextStyle(fontSize: 42)),
                  const Gap(8),
                  Text('Sticker\nPack', textAlign: TextAlign.center,
                    style: GoogleFonts.inter(
                      fontSize: 12, fontWeight: FontWeight.w800,
                      color: Colors.white, height: 1.1)),
                  const Gap(4),
                  Text('Tap to open',
                    style: GoogleFonts.inter(
                      fontSize: 9, fontWeight: FontWeight.w600,
                      color: Colors.white.withValues(alpha: 0.85))),
                ],
              ),
            ),
          ],
        ),
      )
        .animate(
          onPlay: (c) => c.repeat(reverse: true),
          delay: (index * 120).ms,
        )
        .scale(
          begin: const Offset(1, 1),
          end:   const Offset(1.04, 1.04),
          duration: 1200.ms,
          curve: Curves.easeInOut,
        ),
    );
  }
}

class _EmptyPackState extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: _kCard,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: _kBorder, style: BorderStyle.solid),
      ),
      child: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.card_giftcard_outlined, color: _kText2, size: 28),
            const Gap(6),
            Text('Spin, scratch, or play to earn packs',
              style: GoogleFonts.inter(
                fontSize: 12, color: _kText1, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}

// ─── Volume header ────────────────────────────────────────────────────────────

class _VolumeHeader extends StatelessWidget {
  final String volume;
  final AlbumState state;
  final VoidCallback onClaim;
  const _VolumeHeader({
    required this.volume,
    required this.state,
    required this.onClaim,
  });

  @override
  Widget build(BuildContext context) {
    final stickers = _kCatalog.where((s) => s.volume == volume).toList();
    final owned = stickers.where((s) => (state.owned[s.id] ?? 0) > 0).length;
    final complete = owned == stickers.length;
    final claimed = state.claimedVolumes.contains(volume);

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
      child: Row(
        children: [
          Container(
            width: 4, height: 22,
            decoration: BoxDecoration(
              color: _kViolet,
              borderRadius: BorderRadius.circular(12),
            ),
          ),
          const Gap(10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(volume, style: GoogleFonts.inter(
                  fontSize: 16, fontWeight: FontWeight.w800, color: _kText0,
                )),
                Text('$owned of ${stickers.length} collected',
                  style: GoogleFonts.inter(
                    fontSize: 11, fontWeight: FontWeight.w600, color: _kText1)),
              ],
            ),
          ),
          if (complete && !claimed)
            GestureDetector(
              onTap: onClaim,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: _kGold,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.redeem_rounded, size: 14, color: Colors.black),
                    const Gap(4),
                    Text('Claim 500', style: GoogleFonts.inter(
                      fontSize: 12, fontWeight: FontWeight.w800, color: Colors.black)),
                  ],
                ),
              ),
            ).animate(onPlay: (c) => c.repeat(reverse: true))
             .scale(begin: const Offset(1, 1), end: const Offset(1.05, 1.05),
                duration: 900.ms, curve: Curves.easeInOut)
          else if (claimed)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: _kCard2,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: _kBorder),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.check_circle_rounded, size: 12, color: _kGold),
                  const Gap(4),
                  Text('Claimed', style: GoogleFonts.inter(
                    fontSize: 10, fontWeight: FontWeight.w700, color: _kText1)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

// ─── Sticker tile (grid cell) ─────────────────────────────────────────────────

class _StickerTile extends StatelessWidget {
  final StickerDef def;
  final int count;
  final VoidCallback onTap;
  const _StickerTile({
    required this.def,
    required this.count,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final owned = count > 0;
    final isShiny = owned &&
        (def.rarity == Rarity.legendary || def.rarity == Rarity.mythic);

    return GestureDetector(
      onTap: onTap,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
            decoration: BoxDecoration(
              color: owned ? def.rarity.tint.withValues(alpha: 0.2) : _kCard2,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: owned
                    ? def.rarity.tint.withValues(alpha: 0.6)
                    : _kBorder,
                width: 1.5,
              ),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Gap(10),
                Opacity(
                  opacity: owned ? 1 : 0.3,
                  child: ColorFiltered(
                    colorFilter: owned
                        ? const ColorFilter.mode(
                            Colors.transparent, BlendMode.multiply)
                        : const ColorFilter.matrix([
                            0.2126, 0.7152, 0.0722, 0, 0,
                            0.2126, 0.7152, 0.0722, 0, 0,
                            0.2126, 0.7152, 0.0722, 0, 0,
                            0,      0,      0,      1, 0,
                          ]),
                    child: Text(
                      owned ? def.emoji : '❓',
                      style: const TextStyle(fontSize: 34),
                    ),
                  ),
                ),
                const Gap(6),
                Text(
                  owned ? def.name : '???',
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.inter(
                    fontSize: 10.5, fontWeight: FontWeight.w700,
                    color: owned ? Colors.white : _kText2,
                  ),
                ),
                const Gap(2),
                Text(
                  def.rarity.label.toUpperCase(),
                  style: GoogleFonts.inter(
                    fontSize: 8, fontWeight: FontWeight.w800,
                    color: owned
                        ? Colors.white.withValues(alpha: 0.85)
                        : _kText2,
                    letterSpacing: 0.8,
                  ),
                ),
                const Gap(8),
              ],
            ),
          ),

          // Shimmer overlay for legendary+
          if (isShiny)
            Positioned.fill(
              child: IgnorePointer(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(14),
                  child: Container(
                    color: Colors.transparent,
                  )
                    .animate(onPlay: (c) => c.repeat())
                    .shimmer(
                      duration: 2200.ms,
                      color: Colors.white.withValues(alpha: 0.4),
                    ),
                ),
              ),
            ),

          // Duplicate badge
          if (count > 1)
            Positioned(
              top: -4, right: -4,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: _kGold,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: _kBg, width: 1.5),
                ),
                child: Text('×$count', style: GoogleFonts.inter(
                  fontSize: 9, fontWeight: FontWeight.w800, color: Colors.black)),
              ),
            ),

          // Lock icon for un-owned
          if (!owned)
            Positioned(
              top: 6, right: 6,
              child: Container(
                padding: const EdgeInsets.all(3),
                decoration: const BoxDecoration(
                  color: _kBg, shape: BoxShape.circle),
                child: const Icon(
                  Icons.lock_rounded, size: 10, color: _kText2),
              ),
            ),
        ],
      ),
    );
  }
}

// ─── Pack reveal sheet (flip animation + confetti) ────────────────────────────

class _PackRevealSheet extends StatefulWidget {
  final List<_RevealResult> results;
  const _PackRevealSheet({required this.results});

  @override
  State<_PackRevealSheet> createState() => _PackRevealSheetState();
}

class _PackRevealSheetState extends State<_PackRevealSheet>
    with TickerProviderStateMixin {
  late final ConfettiController _confetti =
      ConfettiController(duration: const Duration(seconds: 2));
  final Set<int> _flipped = {};

  @override
  void initState() {
    super.initState();
    final hasRare = widget.results.any((r) =>
        r.sticker.rarity == Rarity.legendary ||
        r.sticker.rarity == Rarity.mythic);
    if (hasRare) _confetti.play();
  }

  @override
  void dispose() {
    _confetti.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: _kCard,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.only(
        top: 22, left: 20, right: 20,
        bottom: MediaQuery.of(context).padding.bottom + 20,
      ),
      child: Stack(
        alignment: Alignment.topCenter,
        children: [
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(width: 44, height: 4,
                decoration: BoxDecoration(
                  color: _kText2, borderRadius: BorderRadius.circular(2))),
              const Gap(14),
              Text('✨ Pack Opened', style: GoogleFonts.inter(
                fontSize: 20, fontWeight: FontWeight.w800, color: _kText0)),
              const Gap(4),
              Text('Tap each card to reveal',
                style: GoogleFonts.inter(
                  fontSize: 12, fontWeight: FontWeight.w600, color: _kText1)),
              const Gap(22),

              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: List.generate(widget.results.length, (i) {
                  final r = widget.results[i];
                  final flipped = _flipped.contains(i);
                  return _FlipCard(
                    result: r,
                    flipped: flipped,
                    onFlip: () {
                      setState(() => _flipped.add(i));
                      HapticFeedback.mediumImpact();
                      if (r.sticker.rarity == Rarity.legendary ||
                          r.sticker.rarity == Rarity.mythic) {
                        _confetti.play();
                      }
                    },
                  );
                }),
              ),

              const Gap(24),

              if (_flipped.length == widget.results.length)
                _summaryCard().animate().fadeIn().slideY(begin: 0.2),

              const Gap(20),

              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _flipped.length == widget.results.length
                      ? () async {
                          // Fly the duplicate coins earned from this pack.
                          final dupCoins = widget.results
                              .fold<int>(0, (a, b) => a + b.duplicateCoins);
                          if (dupCoins > 0) {
                            final box = context.findRenderObject() as RenderBox?;
                            if (box != null && box.hasSize) {
                              final center = box.localToGlobal(Offset.zero) +
                                  Offset(box.size.width / 2,
                                      box.size.height / 2 - 60);
                              // Don't await — let it fly while sheet closes.
                              CoinFly.burst(
                                context,
                                from: center,
                                amount: (dupCoins / 12).clamp(4, 16).toInt(),
                              );
                            }
                          }
                          await Future.delayed(
                              const Duration(milliseconds: 200));
                          if (context.mounted) Navigator.of(context).pop();
                        }
                      : null,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _kViolet,
                    disabledBackgroundColor: _kCard2,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14)),
                  ),
                  child: Text(
                    _flipped.length == widget.results.length
                        ? 'Add to album'
                        : 'Reveal all ${widget.results.length} cards',
                    style: GoogleFonts.inter(
                      fontSize: 14, fontWeight: FontWeight.w800),
                  ),
                ),
              ),
            ],
          ),

          IgnorePointer(
            child: ConfettiWidget(
              confettiController: _confetti,
              blastDirectionality: BlastDirectionality.explosive,
              numberOfParticles: 28,
              emissionFrequency: 0.06,
              colors: const [
                _kGold, _kViolet, Color(0xFFEC4899),
                Color(0xFF3B82F6), Colors.white,
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _summaryCard() {
    final newCount = widget.results.where((r) => r.isNew).length;
    final coins = widget.results.fold<int>(0, (a, b) => a + b.duplicateCoins);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: _kCard2,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _kBorder),
      ),
      child: Row(
        children: [
          Expanded(
            child: Row(
              children: [
                const Icon(Icons.auto_awesome_rounded,
                  color: _kViolet, size: 18),
                const Gap(6),
                Text('$newCount new',
                  style: GoogleFonts.inter(
                    fontSize: 13, fontWeight: FontWeight.w800, color: _kText0)),
              ],
            ),
          ),
          if (coins > 0)
            Row(
              children: [
                const Text('🪙', style: TextStyle(fontSize: 16)),
                const Gap(4),
                Text('+$coins',
                  style: GoogleFonts.inter(
                    fontSize: 13, fontWeight: FontWeight.w800, color: _kGold)),
              ],
            ),
        ],
      ),
    );
  }
}

class _FlipCard extends StatelessWidget {
  final _RevealResult result;
  final bool flipped;
  final VoidCallback onFlip;
  const _FlipCard({
    required this.result,
    required this.flipped,
    required this.onFlip,
  });

  @override
  Widget build(BuildContext context) {
    const w = 94.0;
    const h = 132.0;
    return GestureDetector(
      onTap: flipped ? null : onFlip,
      child: TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: flipped ? math.pi : 0),
        duration: 600.ms,
        curve: Curves.easeOutBack,
        builder: (_, angle, __) {
          final showFront = angle <= math.pi / 2;
          final t = Matrix4.identity()
            ..setEntry(3, 2, 0.001)
            ..rotateY(angle);
          return Transform(
            transform: t,
            alignment: Alignment.center,
            child: showFront
                ? _cardBack(w, h)
                : Transform(
                    transform: Matrix4.identity()..rotateY(math.pi),
                    alignment: Alignment.center,
                    child: _cardFront(w, h),
                  ),
          );
        },
      ),
    );
  }

  Widget _cardBack(double w, double h) => Container(
    width: w, height: h,
    decoration: BoxDecoration(
      color: _kViolet,
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: Colors.white.withValues(alpha: 0.25), width: 2),
    ),
    child: Center(
      child: Text('?', style: GoogleFonts.inter(
        fontSize: 52, fontWeight: FontWeight.w900,
        color: Colors.white.withValues(alpha: 0.95))),
    ),
  );

  Widget _cardFront(double w, double h) {
    final r = result.sticker.rarity;
    return Container(
      width: w, height: h,
      decoration: BoxDecoration(
        color: r.tint.withValues(alpha: 0.25),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withValues(alpha: 0.3), width: 2),
      ),
      child: Stack(
        children: [
          Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(result.sticker.emoji, style: const TextStyle(fontSize: 46)),
                const Gap(4),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: Text(result.sticker.name,
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: GoogleFonts.inter(
                      fontSize: 11, fontWeight: FontWeight.w800,
                      color: Colors.white)),
                ),
                const Gap(2),
                Text(r.label.toUpperCase(),
                  style: GoogleFonts.inter(
                    fontSize: 8, fontWeight: FontWeight.w800,
                    color: Colors.white.withValues(alpha: 0.85),
                    letterSpacing: 1)),
              ],
            ),
          ),
          if (result.isNew)
            Positioned(
              top: 6, left: 6,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                decoration: BoxDecoration(
                  color: _kGold,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text('NEW', style: GoogleFonts.inter(
                  fontSize: 8, fontWeight: FontWeight.w800, color: Colors.black)),
              ),
            ),
          if (!result.isNew && result.duplicateCoins > 0)
            Positioned(
              top: 6, right: 6,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.5),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text('🪙 +${result.duplicateCoins}',
                  style: GoogleFonts.inter(
                    fontSize: 8, fontWeight: FontWeight.w800,
                    color: Colors.white)),
              ),
            ),
        ],
      ),
    );
  }
}

// ─── Sticker detail sheet ─────────────────────────────────────────────────────

class _StickerDetailSheet extends StatelessWidget {
  final StickerDef def;
  final int count;
  const _StickerDetailSheet({required this.def, required this.count});

  @override
  Widget build(BuildContext context) {
    final owned = count > 0;
    return Padding(
      padding: EdgeInsets.only(
        top: 22, left: 22, right: 22,
        bottom: MediaQuery.of(context).padding.bottom + 22,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(width: 44, height: 4,
            decoration: BoxDecoration(
              color: _kText2, borderRadius: BorderRadius.circular(2))),
          const Gap(18),
          Container(
            width: 150, height: 180,
            decoration: BoxDecoration(
              color: owned ? def.rarity.tint.withValues(alpha: 0.2) : _kCard2,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: owned ? def.rarity.tint : _kBorder, width: 2),
            ),
            child: Center(
              child: Text(owned ? def.emoji : '❓',
                style: const TextStyle(fontSize: 72)),
            ),
          ).animate().scale(
            begin: const Offset(0.6, 0.6),
            curve: Curves.elasticOut, duration: 700.ms,
          ),
          const Gap(16),
          Text(owned ? def.name : 'Locked Sticker',
            style: GoogleFonts.inter(
              fontSize: 22, fontWeight: FontWeight.w800, color: _kText0)),
          const Gap(4),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: def.rarity.tint.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: def.rarity.tint.withValues(alpha: 0.5)),
            ),
            child: Text(def.rarity.label.toUpperCase(),
              style: GoogleFonts.inter(
                fontSize: 10, fontWeight: FontWeight.w800,
                color: def.rarity.tint, letterSpacing: 1.2)),
          ),
          const Gap(4),
          Text(def.volume,
            style: GoogleFonts.inter(
              fontSize: 12, fontWeight: FontWeight.w600, color: _kText1)),
          const Gap(18),
          if (owned) ...[
            _statRow('You own', '×$count'),
            const Gap(8),
            _statRow('Duplicate value',
              '🪙 ${def.rarity.duplicateCoins} coins each'),
          ] else
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: _kCard2,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: _kBorder),
              ),
              child: Row(
                children: [
                  const Icon(Icons.lock_rounded, color: _kText2, size: 16),
                  const Gap(8),
                  Expanded(child: Text(
                    'Open packs to discover this ${def.rarity.label.toLowerCase()} sticker',
                    style: GoogleFonts.inter(
                      fontSize: 12, color: _kText1, fontWeight: FontWeight.w600))),
                ],
              ),
            ),
          const Gap(18),
          SizedBox(
            width: double.infinity,
            child: TextButton(
              onPressed: () => Navigator.pop(context),
              style: TextButton.styleFrom(
                backgroundColor: _kCard2,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
              ),
              child: Text('Close', style: GoogleFonts.inter(
                fontSize: 14, fontWeight: FontWeight.w700, color: _kText0)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _statRow(String label, String value) => Row(
    mainAxisAlignment: MainAxisAlignment.spaceBetween,
    children: [
      Text(label, style: GoogleFonts.inter(
        fontSize: 13, color: _kText1, fontWeight: FontWeight.w600)),
      Text(value, style: GoogleFonts.inter(
        fontSize: 13, color: _kText0, fontWeight: FontWeight.w700)),
    ],
  );
}

// ─── Volume prize dialog ──────────────────────────────────────────────────────

class _VolumePrizeDialog extends StatefulWidget {
  final String volume;
  final int coins;
  const _VolumePrizeDialog({required this.volume, required this.coins});

  @override
  State<_VolumePrizeDialog> createState() => _VolumePrizeDialogState();
}

class _VolumePrizeDialogState extends State<_VolumePrizeDialog> {
  late final ConfettiController _c =
      ConfettiController(duration: const Duration(seconds: 2));

  @override
  void initState() {
    super.initState();
    _c.play();
  }

  @override
  void dispose() { _c.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    return Stack(
      alignment: Alignment.topCenter,
      children: [
        AlertDialog(
          backgroundColor: _kCard,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: Column(
            children: [
              const Text('🏆', style: TextStyle(fontSize: 54)),
              const Gap(8),
              Text('Volume Complete!',
                style: GoogleFonts.inter(
                  fontSize: 20, fontWeight: FontWeight.w800, color: _kText0)),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(widget.volume,
                style: GoogleFonts.inter(
                  fontSize: 14, fontWeight: FontWeight.w700, color: _kViolet)),
              const Gap(10),
              Text('You collected every sticker. Here\'s your reward:',
                textAlign: TextAlign.center,
                style: GoogleFonts.inter(
                  fontSize: 13, color: _kText1, fontWeight: FontWeight.w500)),
              const Gap(14),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
                decoration: BoxDecoration(
                  color: _kGold,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('🪙', style: TextStyle(fontSize: 22)),
                    const Gap(8),
                    Text('+${widget.coins} Goins',
                      style: GoogleFonts.inter(
                        fontSize: 20, fontWeight: FontWeight.w800,
                        color: Colors.black)),
                  ],
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: Text('Awesome!', style: GoogleFonts.inter(
                fontSize: 14, fontWeight: FontWeight.w800, color: _kViolet)),
            ),
          ],
        ),
        IgnorePointer(
          child: ConfettiWidget(
            confettiController: _c,
            blastDirectionality: BlastDirectionality.explosive,
            numberOfParticles: 32,
            colors: const [_kGold, _kViolet, Color(0xFFEC4899), Colors.white],
          ),
        ),
      ],
    );
  }
}

// ─── Earned coins footer ──────────────────────────────────────────────────────

class _EarnedCoinsFooter extends StatelessWidget {
  final int coins;
  const _EarnedCoinsFooter({required this.coins});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: _kCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _kBorder),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: _kGold.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Text('🪙', style: TextStyle(fontSize: 22)),
          ),
          const Gap(12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Earned from duplicates',
                  style: GoogleFonts.inter(
                    fontSize: 12, fontWeight: FontWeight.w600, color: _kText1)),
                Text('$coins Goins',
                  style: GoogleFonts.inter(
                    fontSize: 18, fontWeight: FontWeight.w800, color: _kGold)),
              ],
            ),
          ),
          const Icon(Icons.chevron_right_rounded, color: _kText2),
        ],
      ),
    );
  }
}

// ─── Backend flag (flip to true once API ships) ───────────────────────────────
// ignore: unused_element
const bool _backendEnabled = false;
