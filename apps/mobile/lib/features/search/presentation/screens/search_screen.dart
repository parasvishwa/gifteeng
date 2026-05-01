// ─── Global search screen ────────────────────────────────────────────────────
//
// Full-screen search with:
//  - Autofocus text input + clear button
//  - Recent searches (persisted in SharedPreferences, tap to re-search)
//  - Popular queries (static seed)
//  - Live results as user types (debounced 300ms → GET /products?search=…)
//  - Empty state with a suggestion-first UI
//  - Analytics events for search_query, search_result_tap, search_clear
//
// Opens from the _SearchBar on home. Replaces the old "tap → go to /shop".
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../../core/analytics/analytics_service.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/gift_image.dart';

const _kRecentKey = 'search.recent.v1';
const _kMaxRecent = 10;

/// Seed suggestions when the user has no history yet.
const _kPopular = [
  'Anniversary gift',
  'Birthday hamper',
  'Corporate combo',
  'Diwali hampers',
  'Personalized mug',
  'Photo frame',
  'Wedding gift',
  'Under ₹500',
];

class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final TextEditingController _ctrl  = TextEditingController();
  final FocusNode             _focus = FocusNode();
  Timer? _debounce;

  String _query = '';
  List<Map<String, dynamic>> _results = [];
  bool _loading = false;
  List<String> _recent = [];

  @override
  void initState() {
    super.initState();
    _loadRecent();
    Analytics.screen('/search');
    // Autofocus after the first frame so the on-screen keyboard slides up.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focus.requestFocus();
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _ctrl.dispose();
    _focus.dispose();
    super.dispose();
  }

  Future<void> _loadRecent() async {
    final sp = await SharedPreferences.getInstance();
    final raw = sp.getString(_kRecentKey);
    if (raw == null) return;
    try {
      final list = jsonDecode(raw) as List;
      if (!mounted) return;
      setState(() => _recent = list.map((e) => e.toString()).toList());
    } catch (_) {}
  }

  Future<void> _saveRecent(String q) async {
    final cleaned = q.trim();
    if (cleaned.isEmpty) return;
    final updated = [cleaned, ..._recent.where((e) => e != cleaned)]
        .take(_kMaxRecent)
        .toList();
    _recent = updated;
    try {
      final sp = await SharedPreferences.getInstance();
      await sp.setString(_kRecentKey, jsonEncode(updated));
    } catch (_) {}
  }

  Future<void> _clearRecent() async {
    setState(() => _recent = []);
    final sp = await SharedPreferences.getInstance();
    await sp.remove(_kRecentKey);
  }

  void _onChanged(String value) {
    setState(() => _query = value);
    _debounce?.cancel();
    if (value.trim().length < 2) {
      setState(() {
        _results = [];
        _loading = false;
      });
      return;
    }
    setState(() => _loading = true);
    _debounce = Timer(const Duration(milliseconds: 300), () => _runSearch(value.trim()));
  }

  Future<void> _runSearch(String q) async {
    Analytics.track('search_query', {'q': q, 'len': q.length});
    try {
      final dio = ref.read(dioProvider);
      final res = await dio.get('/products', queryParameters: {
        'search':   q,
        'pageSize': 20,
        'status':   'active',
      });
      if (!mounted) return;
      final data = res.data;
      List<Map<String, dynamic>> items;
      if (data is Map) {
        items = List<Map<String, dynamic>>.from(data['items'] ?? []);
      } else if (data is List) {
        items = List<Map<String, dynamic>>.from(data);
      } else {
        items = [];
      }
      setState(() {
        _results = items;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _results = [];
        _loading = false;
      });
    }
  }

  void _submit(String q) {
    final cleaned = q.trim();
    if (cleaned.isEmpty) return;
    _saveRecent(cleaned);
    _ctrl.text = cleaned;
    _onChanged(cleaned);
  }

  void _tapResult(Map<String, dynamic> product) {
    final slug = (product['slug'] ?? '').toString();
    if (slug.isEmpty) return;
    Analytics.track('search_result_tap', {
      'slug': slug,
      'query': _query,
    });
    _saveRecent(_query);
    context.push('/shop/$slug');
  }

  @override
  Widget build(BuildContext context) {
    // Use the theme-aware palette so the search screen respects the user's
    // light/dark setting instead of always rendering on the dark surface.
    final c = GColors.of(context);
    return Scaffold(
      backgroundColor: c.bg0,
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(c),
            Expanded(
              child: _query.trim().length < 2
                  ? _buildSuggestions(c)
                  : _loading
                      ? _buildLoading()
                      : _results.isEmpty
                          ? _buildEmpty(c)
                          : _buildResults(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(GColorsPalette c) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(6, 8, 14, 10),
      child: Row(
        children: [
          IconButton(
            icon: Icon(Icons.arrow_back_rounded, color: c.text0),
            onPressed: () => Navigator.of(context).maybePop(),
          ),
          Expanded(
            child: Container(
              height: 46,
              decoration: BoxDecoration(
                color: c.bg1,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: c.border),
              ),
              child: Row(
                children: [
                  const Gap(12),
                  Icon(Icons.search_rounded, size: 20, color: c.text2),
                  const Gap(8),
                  Expanded(
                    child: TextField(
                      controller:    _ctrl,
                      focusNode:     _focus,
                      textInputAction: TextInputAction.search,
                      onChanged:     _onChanged,
                      onSubmitted:   _submit,
                      style: GoogleFonts.inter(
                        fontSize: 14, color: c.text0,
                        fontWeight: FontWeight.w500,
                      ),
                      decoration: InputDecoration(
                        hintText: 'Search gifts, categories, occasions…',
                        hintStyle: GoogleFonts.inter(
                          fontSize: 13, color: c.text2,
                          fontWeight: FontWeight.w400,
                        ),
                        border:          InputBorder.none,
                        isCollapsed:     true,
                        contentPadding:  EdgeInsets.zero,
                      ),
                    ),
                  ),
                  if (_query.isNotEmpty)
                    IconButton(
                      icon: Icon(Icons.close_rounded,
                          size: 18, color: c.text2),
                      onPressed: () {
                        HapticFeedback.selectionClick();
                        Analytics.track('search_clear');
                        _ctrl.clear();
                        _onChanged('');
                      },
                    )
                  else
                    const Gap(12),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSuggestions(GColorsPalette c) {
    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      children: [
        if (_recent.isNotEmpty) ...[
          const Gap(8),
          Row(
            children: [
              Text('Recent searches', style: GoogleFonts.inter(
                fontSize: 12, fontWeight: FontWeight.w700,
                color: c.text1, letterSpacing: 0.2,
              )),
              const Spacer(),
              GestureDetector(
                onTap: _clearRecent,
                child: Text('Clear', style: GoogleFonts.inter(
                  fontSize: 12, fontWeight: FontWeight.w600,
                  color: GColors.brand,
                )),
              ),
            ],
          ),
          const Gap(10),
          Wrap(
            spacing: 8, runSpacing: 8,
            children: _recent.map((q) => _chip(q, c, onTap: () => _submit(q))).toList(),
          ),
          const Gap(24),
        ],
        // Trending occasions — high-intent shortcuts that drive most traffic.
        Text('Trending occasions', style: GoogleFonts.inter(
          fontSize: 12, fontWeight: FontWeight.w700,
          color: c.text1, letterSpacing: 0.2,
        )),
        const Gap(10),
        Wrap(
          spacing: 8, runSpacing: 8,
          children: const [
            'Birthday', 'Anniversary', 'Mother\'s Day',
            'Wedding', 'Diwali', 'Corporate',
          ].map((q) => _chip(q, c, onTap: () => _submit(q))).toList(),
        ),
        const Gap(24),
        Text('Popular searches', style: GoogleFonts.inter(
          fontSize: 12, fontWeight: FontWeight.w700,
          color: c.text1, letterSpacing: 0.2,
        )),
        const Gap(10),
        Wrap(
          spacing: 8, runSpacing: 8,
          children: _kPopular.map((q) => _chip(q, c, onTap: () => _submit(q))).toList(),
        ),
      ],
    );
  }

  Widget _chip(String label, GColorsPalette c, {required VoidCallback onTap}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: c.bg1,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: c.border),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.history_rounded, size: 13, color: c.text2),
            const Gap(6),
            Text(label, style: GoogleFonts.inter(
              fontSize: 12, fontWeight: FontWeight.w600, color: c.text0,
            )),
          ],
        ),
      ),
    );
  }

  Widget _buildLoading() => const Center(
    child: SizedBox(
      height: 24, width: 24,
      child: CircularProgressIndicator(
        strokeWidth: 2.5,
        valueColor: AlwaysStoppedAnimation(GColors.brand),
      ),
    ),
  );

  Widget _buildEmpty(GColorsPalette c) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('🔍', style: TextStyle(fontSize: 42)),
          const Gap(10),
          Text('No matches for "$_query"', style: GoogleFonts.inter(
            fontSize: 14, fontWeight: FontWeight.w700, color: c.text0,
          )),
          const Gap(4),
          Text('Try a different keyword or browse the shop',
            style: GoogleFonts.inter(
              fontSize: 12, color: c.text2,
            )),
        ],
      ),
    );
  }

  Widget _buildResults() {
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
      itemCount: _results.length,
      separatorBuilder: (_, __) => const Gap(10),
      itemBuilder: (_, i) {
        final p = _results[i];
        return _ResultRow(product: p, onTap: () => _tapResult(p))
            .animate()
            .fadeIn(delay: (i * 25).ms, duration: 200.ms)
            .slideX(begin: 0.05, end: 0);
      },
    );
  }
}

class _ResultRow extends StatelessWidget {
  final Map<String, dynamic> product;
  final VoidCallback onTap;
  const _ResultRow({required this.product, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    final title = (product['title'] ?? product['name'] ?? 'Gift').toString();
    final price = product['basePrice'] ?? product['price'] ?? '';
    final imgs  = product['images'];
    dynamic firstImg;
    if (imgs is List && imgs.isNotEmpty) firstImg = imgs.first;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: c.bg1,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: firstImg != null
                  ? GiftImage(src: firstImg, width: 56, height: 56)
                  : Container(
                      width: 56, height: 56,
                      color: c.bg2,
                      child: Icon(Icons.image_not_supported_outlined,
                          color: c.text2, size: 20),
                    ),
            ),
            const Gap(12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, maxLines: 2, overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.inter(
                      fontSize: 13, fontWeight: FontWeight.w700,
                      color: c.text0, height: 1.25,
                    )),
                  const Gap(4),
                  if (price.toString().isNotEmpty)
                    Text('₹$price', style: GoogleFonts.inter(
                      fontSize: 13, fontWeight: FontWeight.w800,
                      color: c.text0,
                    )),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, color: c.text2),
          ],
        ),
      ),
    );
  }
}
