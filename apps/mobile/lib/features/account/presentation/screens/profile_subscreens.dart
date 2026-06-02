import 'package:cached_network_image/cached_network_image.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/api/api_client.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/g_button.dart';
import '../../../../core/widgets/gift_image.dart';

// ─── Wishlist Screen ──────────────────────────────────────────────────────────

final _wishlistProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  try {
    final dio = ref.watch(dioProvider);
    final res = await dio.get('/wishlist');
    final data = res.data;
    if (data is List) return List<Map<String, dynamic>>.from(data);
    if (data is Map) {
      return List<Map<String, dynamic>>.from(
          data['items'] ?? data['products'] ?? []);
    }
  } catch (_) {}
  return [];
});

class WishlistScreen extends ConsumerWidget {
  const WishlistScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_wishlistProvider);
    return Scaffold(
      backgroundColor: GColors.of(context).bg0,
      appBar: _buildAppBar(context, '❤️  Wishlist'),
      body: async.when(
        loading: () => const Center(
            child: CircularProgressIndicator(color: GColors.brand, strokeWidth: 2)),
        error: (_, __) => _EmptyState(
          emoji: '💔',
          title: 'Could not load wishlist',
          subtitle: 'Try again later',
        ),
        data: (items) {
          if (items.isEmpty) {
            return _EmptyState(
              emoji: '💝',
              title: 'Your wishlist is empty',
              subtitle: 'Tap the heart on any product to save it here',
              action: () => context.go('/shop'),
              actionLabel: 'Explore Gifts',
            );
          }
          return RefreshIndicator(
            color: GColors.brand,
            onRefresh: () async {
              ref.invalidate(_wishlistProvider);
              await ref.read(_wishlistProvider.future);
            },
            child: GridView.builder(
              physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
              padding: const EdgeInsets.all(16),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                childAspectRatio: 0.72,
              ),
              itemCount: items.length,
              itemBuilder: (_, i) => _WishlistCard(item: items[i], ref: ref),
            ),
          );
        },
      ),
    );
  }
}

class _WishlistCard extends StatefulWidget {
  final Map<String, dynamic> item;
  final WidgetRef ref;
  const _WishlistCard({required this.item, required this.ref});

  @override
  State<_WishlistCard> createState() => _WishlistCardState();
}

class _WishlistCardState extends State<_WishlistCard> {
  bool _removing = false;

  Future<void> _remove() async {
    final product   = (widget.item['product'] as Map?) ?? widget.item;
    final productId = (product['id'] ?? widget.item['productId'] ?? '').toString();
    if (productId.isEmpty) return;

    setState(() => _removing = true);
    try {
      final dio = widget.ref.read(dioProvider);
      await dio.delete('/wishlist/$productId');
      widget.ref.invalidate(_wishlistProvider);
    } catch (_) {
      if (mounted) setState(() => _removing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final product    = (widget.item['product'] as Map?) ?? widget.item;
    final title      = product['title'] as String? ?? product['name'] as String? ?? '';
    final price      = (product['basePrice'] ?? product['price'] ?? '0').toString();
    final images     = product['images'] as List? ?? [];
    final firstImage = images.isNotEmpty ? images.first : null;
    final slug       = (product['slug'] ?? product['id'] ?? '').toString();

    return GestureDetector(
      onTap: () {
        HapticFeedback.selectionClick();
        if (slug.isNotEmpty) context.push('/shop/$slug');
      },
      child: Stack(
        children: [
          Container(
            decoration: BoxDecoration(
              color: GColors.of(context).bg1,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: GColors.of(context).border),
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: GiftImage(src: firstImage, fit: BoxFit.cover),
                ),
                Padding(
                  padding: const EdgeInsets.all(10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, maxLines: 2, overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.inter(
                          fontSize: 12, fontWeight: FontWeight.w600,
                          color: GColors.of(context).text0, height: 1.3,
                        )),
                      const Gap(4),
                      Text('₹$price', style: GoogleFonts.inter(
                        fontSize: 14, fontWeight: FontWeight.w800, color: GColors.of(context).text0,
                      )),
                    ],
                  ),
                ),
              ],
            ),
          ),
          // ── Remove (X) button ───────────────────────────────────────────
          Positioned(
            top: 8, right: 8,
            child: GestureDetector(
              onTap: _removing ? null : _remove,
              child: AnimatedOpacity(
                opacity: _removing ? 0.5 : 1.0,
                duration: const Duration(milliseconds: 150),
                child: Container(
                  width: 26, height: 26,
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.55),
                    shape: BoxShape.circle,
                  ),
                  child: _removing
                      ? const Padding(
                          padding: EdgeInsets.all(6),
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.close_rounded,
                          size: 14, color: Colors.white),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Saved Addresses Screen ───────────────────────────────────────────────────

final _addressesProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  try {
    final dio = ref.watch(dioProvider);
    final res = await dio.get('/addresses');
    final data = res.data;
    if (data is List) return List<Map<String, dynamic>>.from(data);
    if (data is Map) return List<Map<String, dynamic>>.from(data['items'] ?? []);
  } catch (_) {}
  return [];
});

class AddressesScreen extends ConsumerWidget {
  const AddressesScreen({super.key});

  /// Public entry-point so `_AddressCard` (defined later in this file) can
  /// reopen the same modal in edit mode without duplicating the form code.
  static void showEditSheet(
    BuildContext context, WidgetRef ref, Map<String, dynamic> existing) {
    _showAddOrEditSheet(context, ref, existing: existing);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_addressesProvider);
    return Scaffold(
      backgroundColor: GColors.of(context).bg0,
      appBar: _buildAppBar(context, '📍  Saved Addresses'),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: GColors.brand,
        foregroundColor: Colors.white,
        onPressed: () => _showAddOrEditSheet(context, ref),
        icon: const Icon(Icons.add_rounded),
        label: Text('Add Address', style: GoogleFonts.inter(fontWeight: FontWeight.w700)),
      ),
      body: async.when(
        loading: () => const Center(
            child: CircularProgressIndicator(color: GColors.brand, strokeWidth: 2)),
        error: (_, __) => _EmptyState(
          emoji: '📍',
          title: 'Could not load addresses',
          subtitle: 'Try again later',
        ),
        data: (addresses) {
          if (addresses.isEmpty) {
            return _EmptyState(
              emoji: '📍',
              title: 'No saved addresses',
              subtitle: 'Add an address for faster checkout',
            );
          }
          return RefreshIndicator(
            color: GColors.brand,
            onRefresh: () async {
              ref.invalidate(_addressesProvider);
              await ref.read(_addressesProvider.future);
            },
            child: ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
              separatorBuilder: (_, __) => const Gap(10),
              itemCount: addresses.length,
              itemBuilder: (_, i) => _AddressCard(address: addresses[i], ref: ref),
            ),
          );
        },
      ),
    );
  }

  /// Unified add / edit address modal. Pass `existing` to prefill all
  /// fields and switch the network call from POST to PATCH.
  static void _showAddOrEditSheet(
    BuildContext context,
    WidgetRef ref, {
    Map<String, dynamic>? existing,
  }) {
    final bool isEdit = existing != null;
    final String editId =
        (existing?['id'] ?? existing?['_id'] ?? '').toString();
    final nameCtrl    = TextEditingController(
        text: (existing?['name'] ?? existing?['fullName'] ?? '').toString());
    final phoneCtrl   = TextEditingController(
        text: (existing?['phone'] ?? '').toString());
    final line1Ctrl   = TextEditingController(
        text: (existing?['line1'] ?? '').toString());
    final cityCtrl    = TextEditingController(
        text: (existing?['city'] ?? '').toString());
    final stateCtrl   = TextEditingController(
        text: (existing?['state'] ?? '').toString());
    final pincodeCtrl = TextEditingController(
        text: (existing?['pincode'] ?? '').toString());

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: GColors.of(context).bg1,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        bool locating = false;
        return StatefulBuilder(
          builder: (ctx, setSheet) {
            final c = GColors.of(ctx);

            // ── GPS auto-fill ─────────────────────────────────────────────
            Future<void> useCurrentLocation() async {
              setSheet(() => locating = true);
              try {
                // Check if location services are enabled on the device
                final serviceEnabled = await Geolocator.isLocationServiceEnabled();
                if (!serviceEnabled) {
                  if (ctx.mounted) {
                    ScaffoldMessenger.of(ctx)
                      ..clearSnackBars()
                      ..showSnackBar(SnackBar(
                        content: const Text('Please enable location services in device settings'),
                        backgroundColor: GColors.rose,
                        behavior: SnackBarBehavior.floating,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ));
                  }
                  return;
                }

                // Permission check — request if needed
                var perm = await Geolocator.checkPermission();
                if (perm == LocationPermission.denied) {
                  perm = await Geolocator.requestPermission();
                }
                if (perm == LocationPermission.deniedForever ||
                    perm == LocationPermission.denied) {
                  if (ctx.mounted) {
                    ScaffoldMessenger.of(ctx)
                      ..clearSnackBars()
                      ..showSnackBar(SnackBar(
                        content: const Text('Location permission denied — allow it in App Settings'),
                        backgroundColor: GColors.rose,
                        behavior: SnackBarBehavior.floating,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ));
                  }
                  return;
                }

                // Get current GPS coordinates
                final pos = await Geolocator.getCurrentPosition(
                  locationSettings: const LocationSettings(
                    accuracy: LocationAccuracy.medium,
                    timeLimit: Duration(seconds: 15),
                  ),
                );

                // Reverse-geocode via OpenStreetMap Nominatim (free, no key needed)
                final resp = await Dio().get(
                  'https://nominatim.openstreetmap.org/reverse',
                  queryParameters: {
                    'format': 'json',
                    'lat': pos.latitude,
                    'lon': pos.longitude,
                    'zoom': 16,
                    'addressdetails': 1,
                  },
                  options: Options(
                    headers: {'User-Agent': 'Gifteeng/1.0 (contact@gifteeng.com)'},
                    receiveTimeout: const Duration(seconds: 10),
                  ),
                );

                final address = (resp.data as Map?)?['address'] as Map?;
                if (address != null) {
                  // Nominatim's "city" field is missing for many Indian
                  // addresses (especially mid-size towns and outside
                  // metropolitan limits), so we fall through a long priority
                  // list of locality-like fields. Without these extra keys
                  // (municipality, state_district, district, city_district,
                  // hamlet) the city box would stay empty even though the
                  // payload returned a usable name.
                  String _pick(List<String> keys) {
                    for (final k in keys) {
                      final v = (address[k] ?? '').toString().trim();
                      if (v.isNotEmpty) return v;
                    }
                    return '';
                  }
                  final pin  = _pick(['postcode']);
                  final city = _pick([
                    'city',
                    'town',
                    'municipality',
                    'city_district',
                    'state_district',
                    'district',
                    'county',
                    'village',
                    'suburb',
                    'hamlet',
                  ]);
                  final st   = _pick(['state', 'region']);
                  final road = _pick([
                    'road',
                    'pedestrian',
                    'residential',
                    'neighbourhood',
                    'suburb',
                  ]);

                  if (road.isNotEmpty && line1Ctrl.text.isEmpty) line1Ctrl.text = road;
                  if (pin.isNotEmpty)  pincodeCtrl.text = pin;
                  if (city.isNotEmpty) cityCtrl.text    = city;
                  if (st.isNotEmpty)   stateCtrl.text   = st;

                  if (ctx.mounted) {
                    ScaffoldMessenger.of(ctx)
                      ..clearSnackBars()
                      ..showSnackBar(SnackBar(
                        content: Text('📍 Location filled${city.isNotEmpty ? " — $city" : ""}'),
                        backgroundColor: GColors.emerald,
                        behavior: SnackBarBehavior.floating,
                        duration: const Duration(seconds: 2),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ));
                  }
                }
              } catch (e) {
                if (ctx.mounted) {
                  ScaffoldMessenger.of(ctx)
                    ..clearSnackBars()
                    ..showSnackBar(SnackBar(
                      content: const Text('Could not detect location — fill manually'),
                      backgroundColor: GColors.rose,
                      behavior: SnackBarBehavior.floating,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ));
                }
              } finally {
                setSheet(() => locating = false);
              }
            }

            return Padding(
              padding: EdgeInsets.only(
                left: 20, right: 20, top: 20,
                bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Handle
                    Center(child: Container(
                      width: 42, height: 4,
                      decoration: BoxDecoration(
                        color: c.border,
                        borderRadius: BorderRadius.circular(2)),
                    )),
                    const Gap(14),
                    Row(children: [
                      Text(isEdit ? 'Edit Address' : 'Add Address',
                          style: GoogleFonts.inter(
                            fontSize: 20, fontWeight: FontWeight.w800,
                            color: c.text0)),
                      const Spacer(),
                      // ── Use my location button ───────────────────────────
                      GestureDetector(
                        onTap: locating ? null : useCurrentLocation,
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 7),
                          decoration: BoxDecoration(
                            color: GColors.sky.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(
                              color: GColors.sky.withValues(alpha: 0.3)),
                          ),
                          child: locating
                              ? const SizedBox(width: 14, height: 14,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2, color: GColors.sky))
                              : Row(mainAxisSize: MainAxisSize.min, children: [
                                  const Icon(Icons.my_location_rounded,
                                      size: 14, color: GColors.sky),
                                  const Gap(5),
                                  Text('Use location',
                                    style: GoogleFonts.inter(
                                      fontSize: 11, fontWeight: FontWeight.w700,
                                      color: GColors.sky)),
                                ]),
                        ),
                      ),
                    ]),
                    const Gap(16),
                    _ModalField(ctrl: nameCtrl,  hint: 'Full Name'),
                    const Gap(10),
                    _ModalField(ctrl: phoneCtrl, hint: 'Phone',
                        type: TextInputType.phone, maxLen: 10),
                    const Gap(10),
                    _ModalField(ctrl: line1Ctrl, hint: 'Address Line'),
                    const Gap(10),
                    Row(children: [
                      Expanded(child: _ModalField(ctrl: cityCtrl,  hint: 'City')),
                      const Gap(10),
                      Expanded(child: _ModalField(ctrl: stateCtrl, hint: 'State')),
                    ]),
                    const Gap(10),
                    _ModalField(ctrl: pincodeCtrl, hint: 'Pincode',
                        type: TextInputType.number, maxLen: 6),
                    const Gap(20),
                    GButton(
                      label: isEdit ? 'Update Address' : 'Save Address',
                      onPressed: () async {
                        final dio = ref.read(dioProvider);
                        final payload = {
                          // Send both keys so the server accepts the payload
                          // whether it expects `name` (current) or `fullName` (legacy).
                          'name':     nameCtrl.text.trim(),
                          'fullName': nameCtrl.text.trim(),
                          'phone':    phoneCtrl.text.trim(),
                          'line1':    line1Ctrl.text.trim(),
                          'city':     cityCtrl.text.trim(),
                          'state':    stateCtrl.text.trim(),
                          'pincode':  pincodeCtrl.text.trim(),
                          'country':  'India',
                        };
                        try {
                          if (isEdit && editId.isNotEmpty) {
                            // Prefer PATCH; fall back to PUT for older servers.
                            try {
                              await dio.patch('/addresses/$editId', data: payload);
                            } on DioException {
                              await dio.put('/addresses/$editId', data: payload);
                            }
                          } else {
                            await dio.post('/addresses', data: payload);
                          }
                          if (ctx.mounted) {
                            Navigator.pop(ctx);
                            ref.invalidate(_addressesProvider);
                            ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(
                              content: Text(
                                isEdit ? 'Address updated' : 'Address saved',
                                style: GoogleFonts.inter(fontWeight: FontWeight.w500),
                              ),
                              backgroundColor: GColors.emerald,
                              behavior: SnackBarBehavior.floating,
                              duration: const Duration(seconds: 2),
                            ));
                          }
                        } on DioException catch (e) {
                          final msg =
                              (e.response?.data as Map?)?['message']
                                  ?.toString() ??
                              (isEdit
                                  ? 'Could not update address'
                                  : 'Could not save address');
                          if (ctx.mounted) {
                            ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(
                              content: Text(msg),
                              backgroundColor: GColors.rose,
                            ));
                          }
                        }
                      },
                    ),
                    const Gap(8),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }
}

class _AddressCard extends StatefulWidget {
  final Map<String, dynamic> address;
  final WidgetRef ref;
  const _AddressCard({required this.address, required this.ref});

  @override
  State<_AddressCard> createState() => _AddressCardState();
}

class _AddressCardState extends State<_AddressCard> {
  bool _deleting   = false;
  bool _settingDef = false;

  String get _id => (widget.address['id'] ?? widget.address['_id'] ?? '').toString();

  Future<void> _delete() async {
    if (_id.isEmpty) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: GColors.of(context).bg1,
        title: Text('Remove address?', style: GoogleFonts.inter(
            fontWeight: FontWeight.w800, color: GColors.of(context).text0)),
        content: Text('This address will be permanently removed.',
            style: GoogleFonts.inter(color: GColors.of(context).text1, fontSize: 13)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text('Cancel', style: GoogleFonts.inter(color: GColors.of(context).text2)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text('Remove', style: GoogleFonts.inter(color: GColors.rose, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => _deleting = true);
    try {
      final dio = widget.ref.read(dioProvider);
      await dio.delete('/addresses/$_id');
      widget.ref.invalidate(_addressesProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Address removed',
              style: GoogleFonts.inter(fontWeight: FontWeight.w500)),
          backgroundColor: GColors.emerald,
          behavior: SnackBarBehavior.floating,
          duration: const Duration(seconds: 2),
        ));
      }
    } on DioException catch (e) {
      final msg = (e.response?.data as Map?)?['message']?.toString() ??
          'Could not remove address';
      if (mounted) {
        setState(() => _deleting = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(msg, style: GoogleFonts.inter(fontWeight: FontWeight.w500)),
          backgroundColor: GColors.rose,
          behavior: SnackBarBehavior.floating,
        ));
      }
    } catch (e) {
      if (mounted) {
        setState(() => _deleting = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Could not remove address: $e',
              style: GoogleFonts.inter(fontWeight: FontWeight.w500)),
          backgroundColor: GColors.rose,
          behavior: SnackBarBehavior.floating,
        ));
      }
    }
  }

  Future<void> _setDefault() async {
    if (_id.isEmpty) return;
    setState(() => _settingDef = true);
    try {
      final dio = widget.ref.read(dioProvider);
      // PATCH first (REST-ful); some backends use POST /addresses/:id/default
      try {
        await dio.patch('/addresses/$_id', data: {'isDefault': true});
      } on DioException {
        // Fallback: dedicated default endpoint
        await dio.post('/addresses/$_id/default');
      }
      widget.ref.invalidate(_addressesProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Set as default address',
              style: GoogleFonts.inter(fontWeight: FontWeight.w500)),
          backgroundColor: GColors.emerald,
          behavior: SnackBarBehavior.floating,
          duration: const Duration(seconds: 2),
        ));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Could not set as default',
              style: GoogleFonts.inter(fontWeight: FontWeight.w500)),
          backgroundColor: GColors.rose,
          behavior: SnackBarBehavior.floating,
        ));
      }
    } finally {
      if (mounted) setState(() => _settingDef = false);
    }
  }

  void _edit() {
    // Reuse the same sheet builder, prefilled with this address.
    AddressesScreen.showEditSheet(context, widget.ref, widget.address);
  }

  @override
  Widget build(BuildContext context) {
    final address   = widget.address;
    final name      = (address['name'] ?? address['fullName']) as String? ?? '';
    final phone     = address['phone']    as String? ?? '';
    final line1     = address['line1']    as String? ?? '';
    final line2     = address['line2']    as String? ?? '';
    final city      = address['city']     as String? ?? '';
    final state     = address['state']    as String? ?? '';
    final pincode   = address['pincode']  as String? ?? '';
    final isDefault = address['isDefault'] as bool? ?? false;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: GColors.of(context).bg1,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDefault ? GColors.brand : GColors.of(context).border,
          width: isDefault ? 1.5 : 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Name + Default badge ───────────────────────────────────────
          Row(children: [
            Expanded(child: Text(name, style: GoogleFonts.inter(
              fontSize: 14, fontWeight: FontWeight.w700, color: GColors.of(context).text0))),
            const Gap(8),
            if (isDefault)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: GColors.brand.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: GColors.brand.withValues(alpha: 0.3)),
                ),
                child: Text('DEFAULT', style: GoogleFonts.inter(
                  fontSize: 9, fontWeight: FontWeight.w800, color: GColors.brand,
                  letterSpacing: 0.5,
                )),
              ),
          ]),
          const Gap(6),
          Text(phone, style: GoogleFonts.inter(fontSize: 12, color: GColors.of(context).text1)),
          const Gap(6),
          Text(
            [line1, line2, city, state, pincode].where((s) => s.isNotEmpty).join(', '),
            style: GoogleFonts.inter(fontSize: 12, color: GColors.of(context).text1, height: 1.5),
          ),

          // ── Action row ─────────────────────────────────────────────────
          const Gap(12),
          const Divider(height: 1),
          const Gap(10),
          Row(children: [
            _AddressActionButton(
              icon: Icons.edit_outlined,
              label: 'Edit',
              onTap: _edit,
            ),
            const Gap(8),
            if (!isDefault)
              _AddressActionButton(
                icon: Icons.star_border_rounded,
                label: 'Set Default',
                onTap: _settingDef ? null : _setDefault,
                loading: _settingDef,
              ),
            const Spacer(),
            _AddressActionButton(
              icon: Icons.delete_outline_rounded,
              label: 'Delete',
              onTap: _deleting ? null : _delete,
              loading: _deleting,
              danger: true,
            ),
          ]),
        ],
      ),
    );
  }
}

/// Single action button used in the address-card action row.
class _AddressActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  final bool loading;
  final bool danger;
  const _AddressActionButton({
    required this.icon,
    required this.label,
    required this.onTap,
    this.loading = false,
    this.danger  = false,
  });

  @override
  Widget build(BuildContext context) {
    final c     = GColors.of(context);
    final color = danger ? GColors.rose : c.text1;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: color.withValues(alpha: 0.2)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (loading)
              SizedBox(
                width: 13, height: 13,
                child: CircularProgressIndicator(strokeWidth: 2, color: color),
              )
            else
              Icon(icon, size: 14, color: color),
            const Gap(5),
            Text(label, style: GoogleFonts.inter(
              fontSize: 11, fontWeight: FontWeight.w700, color: color)),
          ],
        ),
      ),
    );
  }
}

// ─── Legal links provider ─────────────────────────────────────────────────────
// Fetches policy URLs from GET /settings/public (no auth required).
// Falls back to gifteeng.com defaults so the screen never breaks offline.

final _legalLinksProvider =
    FutureProvider.autoDispose<Map<String, String>>((ref) async {
  const _defaults = {
    'privacy_policy': 'https://gifteeng.com/privacy-policy',
    'terms':          'https://gifteeng.com/terms-and-conditions',
    'shipping':       'https://gifteeng.com/shipping-policy',
    'returns':        'https://gifteeng.com/return-policy',
  };
  try {
    final dio = ref.watch(dioProvider);
    final res = await dio.get('/settings/public');
    final data = res.data as Map?;
    final raw = data?['legal_links'];
    if (raw is Map) {
      return {
        'privacy_policy': (raw['privacy_policy'] as String?)?.isNotEmpty == true
            ? raw['privacy_policy'] as String : _defaults['privacy_policy']!,
        'terms': (raw['terms'] as String?)?.isNotEmpty == true
            ? raw['terms'] as String : _defaults['terms']!,
        'shipping': (raw['shipping'] as String?)?.isNotEmpty == true
            ? raw['shipping'] as String : _defaults['shipping']!,
        'returns': (raw['returns'] as String?)?.isNotEmpty == true
            ? raw['returns'] as String : _defaults['returns']!,
      };
    }
  } catch (_) {}
  return _defaults;
});

// ─── Help & Support Screen ────────────────────────────────────────────────────

class HelpScreen extends ConsumerWidget {
  const HelpScreen({super.key});

  static const _faqs = [
    ('How do I place an order?',
     'Browse gifts, tap Add to Cart, and proceed to checkout. Enter delivery details, choose payment method, and confirm. You\'ll receive an order confirmation with tracking details.'),
    ('What is the delivery timeline?',
     'Standard orders: 3–5 business days. Customized orders: 5–8 business days. Express delivery available in select cities.'),
    ('How do Goins work?',
     'Earn Goins on every purchase, review, or referral. Use them to get discounts or play games in Gift Casino for rewards.'),
    ('Can I personalise gifts?',
     'Yes! Products with the Customize button let you add names, photos, and messages before ordering.'),
    ('What is your return policy?',
     'Return unused items within 7 days of delivery. Customized products are non-returnable unless damaged.'),
    ('How do I track my order?',
     'Go to My Orders from your profile — tap any order to see live tracking and courier details.'),
    ('Do you offer COD?',
     'Yes, Cash on Delivery is available on most orders across India.'),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final linksAsync = ref.watch(_legalLinksProvider);
    final links = linksAsync.valueOrNull ?? const {
      'privacy_policy': 'https://gifteeng.com/privacy-policy',
      'terms':          'https://gifteeng.com/terms-and-conditions',
      'shipping':       'https://gifteeng.com/shipping-policy',
      'returns':        'https://gifteeng.com/return-policy',
    };
    return Scaffold(
      backgroundColor: GColors.of(context).bg0,
      appBar: _buildAppBar(context, '🎧  Help & Support'),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          // Contact cards
          _ContactTile(
            emoji: '💬', title: 'Chat with Us',
            subtitle: 'Reply within 15 minutes',
            color: GColors.emerald,
            onTap: () => _openUrl('https://wa.me/919999999999'),
          ),
          const Gap(10),
          _ContactTile(
            emoji: '📧', title: 'Email Support',
            subtitle: 'support@gifteeng.com',
            color: GColors.sky,
            onTap: () => _openUrl('mailto:support@gifteeng.com'),
          ),
          const Gap(10),
          _ContactTile(
            emoji: '📞', title: 'Call Us',
            subtitle: '+91 99999 99999 · 9am–9pm',
            color: GColors.brand,
            onTap: () => _openUrl('tel:+919999999999'),
          ),
          const Gap(28),
          Text('Frequently Asked Questions', style: GoogleFonts.inter(
            fontSize: 16, fontWeight: FontWeight.w800, color: GColors.of(context).text0)),
          const Gap(12),
          ..._faqs.map((f) => _FaqTile(q: f.$1, a: f.$2)),
          const Gap(28),
          Text('Legal & Policies', style: GoogleFonts.inter(
            fontSize: 16, fontWeight: FontWeight.w800, color: GColors.of(context).text0)),
          const Gap(12),
          _PolicyTile(
            emoji: '🔒', title: 'Privacy Policy',
            onTap: () => _openUrl(links['privacy_policy']!),
          ),
          const Gap(8),
          _PolicyTile(
            emoji: '📜', title: 'Terms & Conditions',
            onTap: () => _openUrl(links['terms']!),
          ),
          const Gap(8),
          _PolicyTile(
            emoji: '🚚', title: 'Shipping Policy',
            onTap: () => _openUrl(links['shipping']!),
          ),
          const Gap(8),
          _PolicyTile(
            emoji: '↩️', title: 'Return & Refund Policy',
            onTap: () => _openUrl(links['returns']!),
          ),
          const Gap(32),
        ],
      ),
    );
  }

  Future<void> _openUrl(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) await launchUrl(uri);
  }
}

class _ContactTile extends StatelessWidget {
  final String emoji, title, subtitle;
  final Color color;
  final VoidCallback onTap;
  const _ContactTile({
    required this.emoji, required this.title, required this.subtitle,
    required this.color, required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () { HapticFeedback.selectionClick(); onTap(); },
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: GColors.of(context).bg1,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: GColors.of(context).border),
        ),
        child: Row(children: [
          Container(
            width: 44, height: 44,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Center(child: Text(emoji, style: const TextStyle(fontSize: 22))),
          ),
          const Gap(14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: GoogleFonts.inter(
                fontSize: 14, fontWeight: FontWeight.w700, color: GColors.of(context).text0)),
              const Gap(2),
              Text(subtitle, style: GoogleFonts.inter(
                fontSize: 12, color: GColors.of(context).text2)),
            ]),
          ),
          Icon(Icons.arrow_forward_ios_rounded, size: 14, color: GColors.of(context).text2),
        ]),
      ),
    );
  }
}

class _FaqTile extends StatefulWidget {
  final String q, a;
  const _FaqTile({required this.q, required this.a});
  @override
  State<_FaqTile> createState() => _FaqTileState();
}

class _FaqTileState extends State<_FaqTile> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: GColors.of(context).bg1,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: GColors.of(context).border),
      ),
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          tilePadding: const EdgeInsets.symmetric(horizontal: 16),
          childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
          onExpansionChanged: (v) {
            HapticFeedback.selectionClick();
            setState(() => _open = v);
          },
          title: Text(widget.q, style: GoogleFonts.inter(
            fontSize: 13, fontWeight: FontWeight.w700, color: GColors.of(context).text0)),
          iconColor: GColors.brand,
          collapsedIconColor: GColors.of(context).text2,
          children: [
            Text(widget.a, style: GoogleFonts.inter(
              fontSize: 12, color: GColors.of(context).text1, height: 1.6)),
          ],
        ),
      ),
    );
  }
}

// ─── Policy tile ─────────────────────────────────────────────────────────────

class _PolicyTile extends StatelessWidget {
  final String emoji, title;
  final VoidCallback onTap;
  const _PolicyTile({required this.emoji, required this.title, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () { HapticFeedback.selectionClick(); onTap(); },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: GColors.of(context).bg1,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: GColors.of(context).border),
        ),
        child: Row(children: [
          Text(emoji, style: const TextStyle(fontSize: 18)),
          const Gap(12),
          Expanded(child: Text(title, style: GoogleFonts.inter(
            fontSize: 13, fontWeight: FontWeight.w600, color: GColors.of(context).text0))),
          Icon(Icons.open_in_new_rounded, size: 14, color: GColors.of(context).text2),
        ]),
      ),
    );
  }
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

PreferredSizeWidget _buildAppBar(BuildContext context, String title) {
  return AppBar(
    backgroundColor: GColors.of(context).bg0,
    elevation: 0,
    leading: IconButton(
      icon: Icon(Icons.arrow_back_ios_new_rounded, size: 18, color: GColors.of(context).text0),
      onPressed: () => GoRouter.of(context).pop(),
    ),
    title: Text(title, style: GoogleFonts.inter(
      fontSize: 18, fontWeight: FontWeight.w800, color: GColors.of(context).text0)),
  );
}

class _EmptyState extends StatelessWidget {
  final String emoji, title, subtitle;
  final VoidCallback? action;
  final String? actionLabel;
  const _EmptyState({
    required this.emoji, required this.title, required this.subtitle,
    this.action, this.actionLabel,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(emoji, style: const TextStyle(fontSize: 60)),
            const Gap(16),
            Text(title, textAlign: TextAlign.center,
              style: GoogleFonts.inter(
                fontSize: 18, fontWeight: FontWeight.w800, color: GColors.of(context).text0)),
            const Gap(6),
            Text(subtitle, textAlign: TextAlign.center,
              style: GoogleFonts.inter(fontSize: 13, color: GColors.of(context).text2)),
            if (action != null) ...[
              const Gap(20),
              GestureDetector(
                onTap: action,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                  decoration: BoxDecoration(
                    color: GColors.brand,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(actionLabel ?? 'Continue',
                    style: GoogleFonts.inter(
                      fontSize: 14, fontWeight: FontWeight.w700, color: Colors.white)),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ModalField extends StatelessWidget {
  final TextEditingController ctrl;
  final String hint;
  final TextInputType type;
  final int? maxLen;
  const _ModalField({
    required this.ctrl, required this.hint,
    this.type = TextInputType.text, this.maxLen,
  });
  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: ctrl,
      keyboardType: type,
      maxLength: maxLen,
      style: GoogleFonts.inter(fontSize: 14, color: GColors.of(context).text0),
      decoration: InputDecoration(
        hintText: hint,
        counterText: '',
        hintStyle: GoogleFonts.inter(fontSize: 14, color: GColors.of(context).text2),
        filled: true, fillColor: GColors.of(context).bg2,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: GColors.of(context).border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: GColors.of(context).border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: GColors.brand, width: 1.5),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      ),
    );
  }
}
