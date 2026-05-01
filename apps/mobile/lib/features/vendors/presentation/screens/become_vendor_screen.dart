import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:gap/gap.dart';

import '../../../../core/api/api_client.dart';
import '../../../../core/theme/app_theme.dart';

// Become a Vendor — simple expression-of-interest form. Posts to the existing
// /contact-messages endpoint with subject="Vendor Application".
class BecomeVendorScreen extends ConsumerStatefulWidget {
  const BecomeVendorScreen({super.key});

  @override
  ConsumerState<BecomeVendorScreen> createState() => _BecomeVendorScreenState();
}

class _BecomeVendorScreenState extends ConsumerState<BecomeVendorScreen> {
  final _name      = TextEditingController();
  final _phone     = TextEditingController();
  final _email     = TextEditingController();
  final _biz       = TextEditingController();
  final _city      = TextEditingController();
  final _type      = TextEditingController();
  final _years     = TextEditingController();
  final _message   = TextEditingController();
  bool _saving = false;
  bool _done   = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose(); _phone.dispose(); _email.dispose(); _biz.dispose();
    _city.dispose(); _type.dispose(); _years.dispose(); _message.dispose();
    super.dispose();
  }

  bool get _valid =>
      _name.text.trim().length >= 2 &&
      _phone.text.trim().length >= 10 &&
      _email.text.contains('@') &&
      _biz.text.trim().length >= 2 &&
      _city.text.trim().length >= 2 &&
      _type.text.trim().length >= 2;

  Future<void> _submit() async {
    if (!_valid) return;
    setState(() { _saving = true; _error = null; });
    final body = [
      'Business name: ${_biz.text.trim()}',
      'City: ${_city.text.trim()}',
      'Product type: ${_type.text.trim()}',
      if (_years.text.trim().isNotEmpty) 'Years active: ${_years.text.trim()}',
      if (_message.text.trim().isNotEmpty) '\nMessage:\n${_message.text.trim()}',
    ].join('\n');
    try {
      await ref.read(dioProvider).post('/contact-messages', data: {
        'name':    _name.text.trim(),
        'email':   _email.text.trim(),
        'phone':   _phone.text.trim(),
        'subject': 'Vendor Application',
        'body':    body,
      });
      if (mounted) setState(() { _done = true; _saving = false; });
    } catch (_) {
      if (mounted) setState(() {
        _error = 'Could not submit — please try again or email vendors@gifteeng.com';
        _saving = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    return Scaffold(
      backgroundColor: c.bg0,
      appBar: AppBar(
        backgroundColor: c.bg0,
        elevation: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new_rounded, size: 18, color: c.text0),
          onPressed: () => context.pop(),
        ),
        title: Text('🤝  Become a Vendor', style: GoogleFonts.inter(
          fontSize: 18, fontWeight: FontWeight.w800, color: c.text0)),
      ),
      body: _done ? _buildSuccess(c) : _buildForm(c),
    );
  }

  Widget _buildSuccess(GColorsPalette c) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 80, height: 80,
              decoration: BoxDecoration(
                color: GColors.emerald.withValues(alpha: 0.15),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.check_rounded, size: 40, color: GColors.emerald),
            ),
            const Gap(20),
            Text("We've got your application!", textAlign: TextAlign.center,
                style: GoogleFonts.inter(fontSize: 20, fontWeight: FontWeight.w900, color: c.text0)),
            const Gap(10),
            Text(
              'Our partnerships team will review your details and reach out within 3–5 business days.',
              textAlign: TextAlign.center,
              style: GoogleFonts.inter(fontSize: 13, color: c.text2, height: 1.5),
            ),
            const Gap(28),
            ElevatedButton(
              onPressed: () => context.go('/'),
              style: ElevatedButton.styleFrom(
                backgroundColor: GColors.brand,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                elevation: 0,
              ),
              child: Text('Back to Home', style: GoogleFonts.inter(
                  fontSize: 14, fontWeight: FontWeight.w800)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildForm(GColorsPalette c) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        // Hero
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft, end: Alignment.bottomRight,
              colors: [
                GColors.brand.withValues(alpha: 0.1),
                const Color(0xFF8B5CF6).withValues(alpha: 0.1),
              ],
            ),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: c.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                Container(
                  width: 40, height: 40,
                  decoration: BoxDecoration(
                    color: GColors.brand.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.work_rounded, color: GColors.brand, size: 20),
                ),
                const Gap(10),
                Expanded(child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Sell on Gifteeng', style: GoogleFonts.inter(
                        fontSize: 16, fontWeight: FontWeight.w900, color: c.text0)),
                    Text('Reach buyers across India', style: GoogleFonts.inter(
                        fontSize: 11, color: c.text2)),
                  ],
                )),
              ]),
              const Gap(12),
              ...[
                'Pan-India delivery handled by us',
                'Marketing & SEO support',
                'Weekly settlement payouts',
                'Dedicated vendor dashboard',
              ].map((t) => Padding(
                    padding: const EdgeInsets.only(top: 5),
                    child: Row(children: [
                      const Icon(Icons.check_circle_rounded, size: 14, color: GColors.emerald),
                      const Gap(8),
                      Expanded(child: Text(t, style: GoogleFonts.inter(
                          fontSize: 12, color: c.text1))),
                    ]),
                  )),
            ],
          ),
        ),
        const Gap(20),

        Text('Tell us about your business',
            style: GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w800, color: c.text0)),
        const Gap(12),

        _Field(label: 'Your full name *', icon: Icons.person_rounded,
          ctrl: _name, hint: 'e.g. Rohan Sharma',
          onChanged: () => setState(() {})),
        const Gap(10),
        Row(children: [
          Expanded(child: _Field(label: 'Phone *', icon: Icons.phone_rounded,
            ctrl: _phone, hint: '10-digit mobile',
            type: TextInputType.phone, maxLen: 10,
            onChanged: () => setState(() {}))),
          const Gap(10),
          Expanded(child: _Field(label: 'Email *', icon: Icons.email_rounded,
            ctrl: _email, hint: 'you@biz.com',
            type: TextInputType.emailAddress,
            onChanged: () => setState(() {}))),
        ]),
        const Gap(10),
        _Field(label: 'Business name *', icon: Icons.work_rounded,
          ctrl: _biz, hint: 'e.g. Sharma Crafts & Gifts',
          onChanged: () => setState(() {})),
        const Gap(10),
        Row(children: [
          Expanded(child: _Field(label: 'City *', icon: Icons.location_on_rounded,
            ctrl: _city, hint: 'e.g. Jaipur',
            onChanged: () => setState(() {}))),
          const Gap(10),
          Expanded(child: _Field(label: 'Product type *', icon: Icons.category_rounded,
            ctrl: _type, hint: 'wooden frames',
            onChanged: () => setState(() {}))),
        ]),
        const Gap(10),
        _Field(label: 'Years in business (optional)', icon: Icons.timeline_rounded,
          ctrl: _years, hint: 'e.g. 5',
          type: TextInputType.number, maxLen: 3,
          onChanged: () => setState(() {})),
        const Gap(10),
        _Field(label: 'Anything else (optional)', icon: null,
          ctrl: _message, hint: 'Capacity, MOQs, brands carried, etc.',
          maxLines: 4, maxLen: 500,
          onChanged: () => setState(() {})),

        if (_error != null) ...[
          const Gap(12),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: GColors.rose.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(_error!, style: GoogleFonts.inter(
                fontSize: 12, color: GColors.rose)),
          ),
        ],

        const Gap(20),
        ElevatedButton(
          onPressed: !_valid || _saving ? null : _submit,
          style: ElevatedButton.styleFrom(
            backgroundColor: GColors.brand,
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 14),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            elevation: 0,
            disabledBackgroundColor: c.bg2,
            disabledForegroundColor: c.text2,
          ),
          child: _saving
              ? const SizedBox(width: 18, height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : Text('Submit Application', style: GoogleFonts.inter(
                  fontSize: 14, fontWeight: FontWeight.w900)),
        ),
        const Gap(8),
        Center(child: Text(
          'We typically respond within 3–5 business days.',
          style: GoogleFonts.inter(fontSize: 11, color: c.text2),
        )),
      ],
    );
  }
}

class _Field extends StatelessWidget {
  final String label;
  final IconData? icon;
  final TextEditingController ctrl;
  final String hint;
  final TextInputType type;
  final int maxLines;
  final int? maxLen;
  final VoidCallback onChanged;
  const _Field({
    required this.label, required this.icon, required this.ctrl,
    required this.hint, this.type = TextInputType.text,
    this.maxLines = 1, this.maxLen, required this.onChanged,
  });
  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          if (icon != null) Icon(icon, size: 13, color: c.text2),
          if (icon != null) const Gap(5),
          Text(label, style: GoogleFonts.inter(
              fontSize: 11, fontWeight: FontWeight.w700, color: c.text2)),
        ]),
        const Gap(6),
        TextField(
          controller: ctrl,
          keyboardType: type,
          maxLength: maxLen,
          maxLines: maxLines,
          onChanged: (_) => onChanged(),
          style: GoogleFonts.inter(fontSize: 13, color: c.text0),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: GoogleFonts.inter(fontSize: 13, color: c.text2),
            counterText: '',
            filled: true, fillColor: c.bg2,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: c.border),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: BorderSide(color: c.border),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: const BorderSide(color: GColors.brand, width: 1.5),
            ),
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
          ),
        ),
      ],
    );
  }
}
