// ─── Gift reminders screen ───────────────────────────────────────────────────
//
// Lets a customer set up recurring or one-shot reminders for gifting
// occasions (birthdays, anniversaries, festivals). Backed by the
// /gift-reminders endpoints. When a reminder is within notifyDaysBefore
// of the event, the backend's daily cron fires a push notification with a
// deep-link into the shop (optionally pre-filtered by category).
//
// Backend contract (same shape web uses):
//   GET    /api/gift-reminders
//   POST   /api/gift-reminders       { occasion, eventDate, … }
//   PATCH  /api/gift-reminders/:id
//   DELETE /api/gift-reminders/:id
//
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

import '../../../../core/analytics/analytics_service.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/g_button.dart';

// ─── Data ────────────────────────────────────────────────────────────────────

class _OccasionSpec {
  final String slug;
  final String label;
  final String emoji;
  const _OccasionSpec(this.slug, this.label, this.emoji);
}

const _kOccasions = <_OccasionSpec>[
  _OccasionSpec('birthday',     'Birthday',         '🎂'),
  _OccasionSpec('anniversary',  'Anniversary',      '💍'),
  _OccasionSpec('wedding',      'Wedding',          '💐'),
  _OccasionSpec('mothers-day',  "Mother's Day",     '🌸'),
  _OccasionSpec('fathers-day',  "Father's Day",     '👔'),
  _OccasionSpec('diwali',       'Diwali',           '🪔'),
  _OccasionSpec('christmas',    'Christmas',        '🎄'),
  _OccasionSpec('valentine',    "Valentine's Day",  '💝'),
  _OccasionSpec('rakhi',        'Raksha Bandhan',   '🎗️'),
  _OccasionSpec('housewarming', 'Housewarming',     '🏠'),
  _OccasionSpec('custom',       'Other',            '🎁'),
];

_OccasionSpec _specFor(String slug) =>
    _kOccasions.firstWhere((o) => o.slug == slug,
        orElse: () => const _OccasionSpec('custom', 'Other', '🎁'));

// ─── Provider ────────────────────────────────────────────────────────────────

final remindersListProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  try {
    final dio = ref.watch(dioProvider);
    final res = await dio.get('/gift-reminders');
    final data = res.data;
    if (data is List) return List<Map<String, dynamic>>.from(data);
    return [];
  } catch (_) {
    return [];
  }
});

// ─── List screen ─────────────────────────────────────────────────────────────

class RemindersScreen extends ConsumerStatefulWidget {
  const RemindersScreen({super.key});

  @override
  ConsumerState<RemindersScreen> createState() => _RemindersScreenState();
}

class _RemindersScreenState extends ConsumerState<RemindersScreen> {
  @override
  void initState() {
    super.initState();
    Analytics.screen('/reminders');
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(remindersListProvider);
    return Scaffold(
      backgroundColor: GColors.of(context).bg0,
      appBar: AppBar(
        backgroundColor: GColors.of(context).bg0,
        elevation: 0,
        title: Text('Gift Reminders', style: GoogleFonts.inter(
          fontSize: 17, fontWeight: FontWeight.w800, color: GColors.of(context).text0,
        )),
        iconTheme: IconThemeData(color: GColors.of(context).text0),
      ),
      body: async.when(
        loading: () => const Center(
          child: CircularProgressIndicator(
            strokeWidth: 2.5,
            valueColor: AlwaysStoppedAnimation(GColors.brand),
          ),
        ),
        error: (_, __) => _empty(),
        data: (list) => list.isEmpty ? _empty() : _list(list),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _openEditor(null),
        backgroundColor: GColors.brand,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add_rounded),
        label: Text('Add reminder', style: GoogleFonts.inter(
          fontWeight: FontWeight.w800,
        )),
      ),
    );
  }

  Widget _empty() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('🎁', style: TextStyle(fontSize: 64)),
            const Gap(12),
            Text('No reminders yet',
              style: GoogleFonts.inter(
                fontSize: 18, fontWeight: FontWeight.w800, color: GColors.of(context).text0,
              )),
            const Gap(6),
            Text(
              "We'll nudge you before birthdays, anniversaries, and festivals so your gift always arrives on time.",
              textAlign: TextAlign.center,
              style: GoogleFonts.inter(
                fontSize: 13, color: GColors.of(context).text2, height: 1.4,
              ),
            ),
            const Gap(18),
            GButton(
              label: 'Add your first reminder',
              onPressed: () => _openEditor(null),
            ),
          ],
        ),
      ),
    );
  }

  Widget _list(List<Map<String, dynamic>> items) {
    return RefreshIndicator(
      color: GColors.brand,
      backgroundColor: GColors.of(context).bg1,
      onRefresh: () async => ref.invalidate(remindersListProvider),
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
        itemCount: items.length,
        separatorBuilder: (_, __) => const Gap(10),
        itemBuilder: (_, i) {
          final r = items[i];
          return _ReminderRow(
            reminder: r,
            onEdit:   () => _openEditor(r),
            onDelete: () => _confirmDelete(r),
          ).animate().fadeIn(delay: (i * 40).ms, duration: 250.ms)
              .slideX(begin: 0.05, end: 0);
        },
      ),
    );
  }

  Future<void> _openEditor(Map<String, dynamic>? existing) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ReminderEditorSheet(existing: existing),
    );
    if (saved == true) {
      ref.invalidate(remindersListProvider);
    }
  }

  Future<void> _confirmDelete(Map<String, dynamic> r) async {
    HapticFeedback.selectionClick();
    final id = (r['id'] ?? '').toString();
    if (id.isEmpty) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: GColors.of(context).bg1,
        title: Text('Delete reminder?', style: GoogleFonts.inter(
          fontWeight: FontWeight.w800, color: GColors.of(context).text0,
        )),
        content: Text(
          "We'll stop reminding you. You can always add it back later.",
          style: GoogleFonts.inter(color: GColors.of(context).text1),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: const Color(0xFFEF4444)),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      final dio = ref.read(dioProvider);
      await dio.delete('/gift-reminders/$id');
      Analytics.track('reminder_deleted', {'id': id});
      if (!mounted) return;
      ref.invalidate(remindersListProvider);
    } catch (_) {}
  }
}

// ─── List row ────────────────────────────────────────────────────────────────

class _ReminderRow extends StatelessWidget {
  final Map<String, dynamic> reminder;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  const _ReminderRow({
    required this.reminder,
    required this.onEdit,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    final occ = _specFor((reminder['occasion'] ?? 'custom').toString());
    final recipient = (reminder['recipientName'] ?? '').toString();
    final eventDateRaw = reminder['eventDate'];
    final eventDate = eventDateRaw is String
        ? DateTime.tryParse(eventDateRaw)
        : (eventDateRaw is DateTime ? eventDateRaw : null);
    final recurring = reminder['recurring'] == true;
    final autoOrder = reminder['autoOrder'] == true;

    final daysUntil = eventDate == null ? null : _daysUntilNext(eventDate, recurring);
    final chipColor = daysUntil != null && daysUntil <= 7
        ? const Color(0xFFEC4899)
        : c.text1;
    final chipLabel = daysUntil == null
        ? '—'
        : daysUntil == 0
            ? 'Today'
            : daysUntil == 1
                ? 'Tomorrow'
                : '$daysUntil days';

    return GestureDetector(
      onTap: onEdit,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: c.bg1,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Container(
              width: 48, height: 48,
              decoration: BoxDecoration(
                color: c.bg2,
                borderRadius: BorderRadius.circular(12),
              ),
              alignment: Alignment.center,
              child: Text(occ.emoji, style: const TextStyle(fontSize: 24)),
            ),
            const Gap(12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    recipient.isNotEmpty ? '$recipient — ${occ.label}' : occ.label,
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.inter(
                      fontSize: 14, fontWeight: FontWeight.w800, color: c.text0,
                    ),
                  ),
                  const Gap(2),
                  Row(
                    children: [
                      if (eventDate != null)
                        Text(
                          DateFormat(recurring ? 'd MMM (yearly)' : 'd MMM y').format(eventDate),
                          style: GoogleFonts.inter(
                            fontSize: 12, color: c.text2, fontWeight: FontWeight.w500,
                          ),
                        ),
                      if (autoOrder) ...[
                        const Gap(8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: const Color(0xFF8B5CF6).withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text('AUTO', style: GoogleFonts.inter(
                            fontSize: 9, fontWeight: FontWeight.w800,
                            color: const Color(0xFF8B5CF6), letterSpacing: 0.5,
                          )),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: chipColor.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(chipLabel, style: GoogleFonts.inter(
                fontSize: 11, fontWeight: FontWeight.w800, color: chipColor,
              )),
            ),
            IconButton(
              onPressed: onDelete,
              icon: Icon(Icons.delete_outline, color: c.text2, size: 18),
              tooltip: 'Delete',
            ),
          ],
        ),
      ),
    );
  }
}

int _daysUntilNext(DateTime event, bool recurring) {
  final today = DateTime.now();
  final start = DateTime(today.year, today.month, today.day);
  if (!recurring) {
    final occ = DateTime(event.year, event.month, event.day);
    return occ.difference(start).inDays;
  }
  var occ = DateTime(start.year, event.month, event.day);
  if (occ.isBefore(start)) occ = DateTime(start.year + 1, event.month, event.day);
  return occ.difference(start).inDays;
}

// ─── Editor sheet ────────────────────────────────────────────────────────────

class _ReminderEditorSheet extends ConsumerStatefulWidget {
  final Map<String, dynamic>? existing;
  const _ReminderEditorSheet({this.existing});

  @override
  ConsumerState<_ReminderEditorSheet> createState() => _ReminderEditorSheetState();
}

class _ReminderEditorSheetState extends ConsumerState<_ReminderEditorSheet> {
  String _occasion = 'birthday';
  final _recipientCtrl = TextEditingController();
  DateTime _eventDate = DateTime.now().add(const Duration(days: 30));
  bool _recurring = true;
  int _notifyDaysBefore = 7;
  bool _saving = false;
  String? _error;

  bool get _isEdit => widget.existing != null;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    if (e != null) {
      _occasion = (e['occasion'] ?? 'birthday').toString();
      _recipientCtrl.text = (e['recipientName'] ?? '').toString();
      final raw = e['eventDate'];
      if (raw is String) {
        _eventDate = DateTime.tryParse(raw) ?? _eventDate;
      }
      _recurring = e['recurring'] == true;
      _notifyDaysBefore = (e['notifyDaysBefore'] as num?)?.toInt() ?? 7;
    }
  }

  @override
  void dispose() {
    _recipientCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    HapticFeedback.selectionClick();
    final picked = await showDatePicker(
      context: context,
      initialDate: _eventDate,
      firstDate: DateTime(DateTime.now().year - 1),
      lastDate:  DateTime(DateTime.now().year + 10),
      builder: (_, child) => Theme(
        data: Theme.of(context).copyWith(
          colorScheme: const ColorScheme.dark(
            primary:   GColors.brand,
            onPrimary: Colors.white,
            surface:   GColors.bg1,
            onSurface: GColors.text0,
          ),
        ),
        child: child ?? const SizedBox.shrink(),
      ),
    );
    if (picked != null) setState(() => _eventDate = picked);
  }

  Future<void> _save() async {
    setState(() { _saving = true; _error = null; });
    try {
      final dio = ref.read(dioProvider);
      final body = {
        'occasion':         _occasion,
        'recipientName':    _recipientCtrl.text.trim().isEmpty ? null : _recipientCtrl.text.trim(),
        'eventDate':        _eventDate.toUtc().toIso8601String(),
        'recurring':        _recurring,
        'notifyDaysBefore': _notifyDaysBefore,
      };
      if (_isEdit) {
        final id = (widget.existing!['id'] ?? '').toString();
        await dio.patch('/gift-reminders/$id', data: body);
        Analytics.track('reminder_updated', {'id': id});
      } else {
        await dio.post('/gift-reminders', data: body);
        Analytics.track('reminder_created', {'occasion': _occasion});
      }
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (e) {
      setState(() { _saving = false; _error = 'Could not save. Try again.'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    final keyboardPad = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: keyboardPad),
      child: Container(
        decoration: BoxDecoration(
          color: c.bg0,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 36, height: 4,
                decoration: BoxDecoration(
                  color: c.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const Gap(16),
            Text(_isEdit ? 'Edit reminder' : 'New reminder',
              style: GoogleFonts.inter(
                fontSize: 18, fontWeight: FontWeight.w800, color: c.text0,
              )),
            const Gap(18),

            // Occasion chips
            Text('Occasion', style: GoogleFonts.inter(
              fontSize: 11, fontWeight: FontWeight.w700,
              color: c.text1, letterSpacing: 0.3,
            )),
            const Gap(8),
            SizedBox(
              height: 40,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: _kOccasions.length,
                separatorBuilder: (_, __) => const Gap(8),
                itemBuilder: (_, i) {
                  final o = _kOccasions[i];
                  final selected = o.slug == _occasion;
                  return GestureDetector(
                    onTap: () {
                      HapticFeedback.selectionClick();
                      setState(() => _occasion = o.slug);
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: selected ? GColors.brand.withValues(alpha: 0.15) : c.bg1,
                        border: Border.all(
                          color: selected ? GColors.brand : c.border,
                        ),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(o.emoji, style: const TextStyle(fontSize: 14)),
                          const Gap(6),
                          Text(o.label, style: GoogleFonts.inter(
                            fontSize: 12, fontWeight: FontWeight.w700,
                            color: selected ? GColors.brand : c.text0,
                          )),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),

            const Gap(18),

            // Recipient
            TextField(
              controller: _recipientCtrl,
              style: GoogleFonts.inter(color: c.text0, fontSize: 14),
              decoration: InputDecoration(
                labelText: 'Recipient (optional)',
                hintText: 'Mom, Priya, …',
                filled: true,
                fillColor: c.bg1,
                labelStyle: GoogleFonts.inter(color: c.text1, fontSize: 12),
                hintStyle:  GoogleFonts.inter(color: c.text2, fontSize: 13),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: c.border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: GColors.brand),
                ),
              ),
            ),

            const Gap(14),

            // Date picker
            GestureDetector(
              onTap: _pickDate,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                decoration: BoxDecoration(
                  color: c.bg1,
                  border: Border.all(color: c.border),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    Icon(Icons.calendar_today_rounded,
                        size: 18, color: c.text1),
                    const Gap(10),
                    Expanded(
                      child: Text(
                        DateFormat(_recurring ? "MMMM d (yearly)" : "MMMM d, yyyy").format(_eventDate),
                        style: GoogleFonts.inter(
                          fontSize: 14, fontWeight: FontWeight.w600, color: c.text0,
                        ),
                      ),
                    ),
                    Icon(Icons.edit_rounded, size: 16, color: c.text2),
                  ],
                ),
              ),
            ),

            const Gap(14),

            // Recurring switch
            Row(
              children: [
                Expanded(
                  child: Text('Repeats yearly', style: GoogleFonts.inter(
                    fontSize: 14, fontWeight: FontWeight.w600, color: c.text0,
                  )),
                ),
                Switch.adaptive(
                  value: _recurring,
                  activeTrackColor: GColors.brand,
                  onChanged: (v) => setState(() => _recurring = v),
                ),
              ],
            ),

            const Gap(6),

            // Notify days before
            Row(
              children: [
                Expanded(
                  child: Text('Notify before event', style: GoogleFonts.inter(
                    fontSize: 14, fontWeight: FontWeight.w600, color: c.text0,
                  )),
                ),
                Text('$_notifyDaysBefore ${_notifyDaysBefore == 1 ? "day" : "days"}',
                  style: GoogleFonts.inter(
                    fontSize: 13, fontWeight: FontWeight.w700, color: c.text0,
                  )),
              ],
            ),
            SliderTheme(
              data: SliderTheme.of(context).copyWith(
                activeTrackColor: GColors.brand,
                inactiveTrackColor: c.bg2,
                thumbColor: GColors.brand,
                overlayColor: GColors.brand.withValues(alpha: 0.2),
              ),
              child: Slider(
                value: _notifyDaysBefore.toDouble(),
                min: 1,
                max: 30,
                divisions: 29,
                onChanged: (v) => setState(() => _notifyDaysBefore = v.round()),
              ),
            ),

            if (_error != null) ...[
              const Gap(6),
              Text(_error!, style: GoogleFonts.inter(
                fontSize: 12, color: const Color(0xFFEF4444),
                fontWeight: FontWeight.w500,
              )),
            ],

            const Gap(12),

            GButton(
              label: _saving ? 'Saving…' : (_isEdit ? 'Save changes' : 'Add reminder'),
              onPressed: _saving ? null : _save,
            ),

            const Gap(8),
          ],
        ),
      ),
    );
  }
}
