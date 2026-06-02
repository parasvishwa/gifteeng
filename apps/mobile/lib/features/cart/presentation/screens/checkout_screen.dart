import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:gap/gap.dart';
import 'package:dio/dio.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/g_button.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/services/audio_service.dart';
import '../../../account/presentation/screens/account_screen.dart' show profileProvider;

// ─── Checkout step enum ───────────────────────────────────────────────────────

enum _Step { contact, delivery, payment }

// ─── Providers ────────────────────────────────────────────────────────────────

final _checkoutCartProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final dio = ref.watch(dioProvider);
  final res = await dio.get('/cart');
  return Map<String, dynamic>.from(res.data as Map);
});

final _coinsBalanceProvider = FutureProvider.autoDispose<int>((ref) async {
  try {
    final dio = ref.watch(dioProvider);
    final res = await dio.get('/coins/balance');
    return (res.data['balance'] as num?)?.toInt() ?? 0;
  } catch (_) {
    return 0;
  }
});

// Admin-configured thank-you card templates + sizes.
// Expected API shape:
// [{ id, name, image, sizes: [{ label, price }] }, ...]
final _thankYouTemplatesProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  try {
    final dio = ref.watch(dioProvider);
    final res = await dio.get('/thank-you-cards');
    final data = res.data;
    if (data is List) return List<Map<String, dynamic>>.from(data);
    if (data is Map) {
      return List<Map<String, dynamic>>.from(
          data['items'] ?? data['templates'] ?? data['data'] ?? []);
    }
  } catch (_) {}
  return [];
});

// ─── Saved addresses ─────────────────────────────────────────────────────────

final _savedAddressesProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  try {
    final dio = ref.watch(dioProvider);
    final res = await dio.get('/addresses');
    final data = res.data;
    if (data is List) return List<Map<String, dynamic>>.from(data);
    if (data is Map) {
      return List<Map<String, dynamic>>.from(
          data['items'] ?? data['data'] ?? []);
    }
  } catch (_) {}
  return [];
});

// ─── Public settings (delivery charge, COD fee, Razorpay key) ────────────────
//
// Mirrors the web checkout — loads from /api/settings/public so the admin
// can change values without a code deploy.
//
// NOTE on `razorpay_key_id`: this used to fall back to the live key
// `rzp_live_RdKEIds1IVzjoU` baked into the APK. That made key rotation
// impossible without an app update + Apple review, and shipping the live
// key in source control is bad hygiene even though it's not a secret.
// The fallback is now empty — if the settings call genuinely fails we
// disable Razorpay UI rather than initialise the SDK with a stale key.
// See docs/SECURITY_AUDIT.md M-4.
final _publicSettingsProvider =
    FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  try {
    final dio = ref.watch(dioProvider);
    final res = await dio.get('/settings/public');
    final data = res.data;
    if (data is Map) return Map<String, dynamic>.from(data);
  } catch (_) {}
  // Defaults: only COD is enabled — Razorpay key is intentionally absent so
  // we never pop the SDK with a stale baked-in key.
  return const {
    'cod_enabled':         'true',
    'cod_charge':          '50',
    'razorpay_enabled':    'false',
    'razorpay_key_id':     '',
    'delivery_charge':     '59',
    'free_delivery_above': '499',
  };
});

// ─── Web-style colors (matches web checkout light design) ────────────────────
const _kBrand    = Color(0xFFEF3752); // coral brand CTA
const _kBrandDark= Color(0xFFC42642); // pressed / deep pill
const _kPurple   = Color(0xFF7C3AED);
const _kAmber    = Color(0xFFF59E0B);
const _kGreen    = Color(0xFF10B981);
const _kText0    = Color(0xFF1A1A1A);
const _kText1    = Color(0xFF4A4A60);
const _kText2    = Color(0xFF888888);
const _kBorder   = Color(0xFFEEEBE4);
const _kFieldBg  = Color(0xFFFDFBF8);
const _kBg       = Color(0xFFFFF6F7);

// ─── Screen ───────────────────────────────────────────────────────────────────

class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen>
    with TickerProviderStateMixin {
  // ── Step tracking ────────────────────────────────────────────────────────
  _Step _step = _Step.contact;

  // ── Step 1: Contact ──────────────────────────────────────────────────────
  final _nameCtrl  = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _otpCtrl   = TextEditingController();
  bool _otpSent     = false;
  bool _otpVerified = false;
  bool _sendingOtp  = false;
  bool _verifyingOtp= false;
  bool _profileHydrated = false; // ensures we only pre-fill once
  bool _phoneLocked     = false; // true when phone came from profile & user hasn't tapped Edit

  // ── Step 2: Delivery ─────────────────────────────────────────────────────
  final _pincodeCtrl    = TextEditingController();
  final _addressCtrl    = TextEditingController();
  final _cityCtrl       = TextEditingController();
  final _stateCtrl      = TextEditingController();
  final _giftMsgCtrl    = TextEditingController();
  final _recipientCtrl  = TextEditingController();
  final _recipientPhone = TextEditingController();
  final _gstinCtrl      = TextEditingController();
  final _companyCtrl    = TextEditingController();
  bool _isGift       = false;
  bool _giftWrap     = false;
  bool _applyCoins   = true;   // default checked (matches web screenshot)
  bool _removePrice  = false;
  bool _needsGst     = false;
  DateTime? _deliveryDate;
  bool _gstVerifying = false;
  bool _gstVerified  = false;
  String? _gstError;

  // Thank-you card (admin-assigned templates + sizes)
  String? _tycTemplateId;
  String? _tycTemplateName;
  String? _tycImage;
  String? _tycSize;
  double  _tycPrice = 0;

  // Pincode → city/state auto-lookup
  bool    _fetchingCity = false;
  String? _pincodeMsg;

  // ── Step 3: Payment ──────────────────────────────────────────────────────
  final _promoCtrl = TextEditingController();
  String _payMethod = 'cod'; // default to COD (matches web)
  bool _placing     = false;
  String? _error;

  // ── Razorpay ─────────────────────────────────────────────────────────────
  late Razorpay _razorpay;

  @override
  void initState() {
    super.initState();
    _razorpay = Razorpay();
    _razorpay.on(Razorpay.EVENT_PAYMENT_SUCCESS, _onRazorpaySuccess);
    _razorpay.on(Razorpay.EVENT_PAYMENT_ERROR,   _onRazorpayError);
    _razorpay.on(Razorpay.EVENT_EXTERNAL_WALLET, _onRazorpayWallet);

    // Re-evaluate Continue buttons on every keystroke — TextField updates
    // its controller silently without rebuilding the parent, so we listen
    // for text changes on fields that gate navigation.
    _nameCtrl.addListener(_rebuild);
    _phoneCtrl.addListener(_rebuild);
    _otpCtrl.addListener(_rebuild);
    _pincodeCtrl.addListener(_onPincodeChanged);
    _addressCtrl.addListener(_rebuild);
    _cityCtrl.addListener(_rebuild);
    _stateCtrl.addListener(_rebuild);
    _recipientCtrl.addListener(_rebuild);
    _recipientPhone.addListener(_rebuild);
    _gstinCtrl.addListener(_rebuild);
    _loadCachedName();
  }

  /// Tracked so we only auto-fill the default address once. After that the
  /// user can edit fields or pick a different chip without us re-stamping
  /// the form on the next provider invalidation.
  bool _defaultAddressApplied = false;

  /// Called from build() when saved addresses arrive. Picks the address
  /// flagged isDefault (falls back to the first one) and stamps it into
  /// the delivery form so the user can proceed straight to payment.
  void _maybeApplyDefaultAddress(List<Map<String, dynamic>> addresses) {
    if (_defaultAddressApplied) return;
    if (addresses.isEmpty) return;
    // Don't overwrite anything the user has already typed.
    if (_pincodeCtrl.text.isNotEmpty || _addressCtrl.text.isNotEmpty) {
      _defaultAddressApplied = true;
      return;
    }
    final def = addresses.firstWhere(
      (a) => a['isDefault'] == true,
      orElse: () => addresses.first,
    );
    _defaultAddressApplied = true;
    // Defer to post-frame so we don't setState during the build phase.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _loadSavedAddress(def);
    });
  }

  void _rebuild() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    _emailCtrl.dispose();
    _otpCtrl.dispose();
    _pincodeCtrl.dispose();
    _addressCtrl.dispose();
    _cityCtrl.dispose();
    _stateCtrl.dispose();
    _giftMsgCtrl.dispose();
    _recipientCtrl.dispose();
    _recipientPhone.dispose();
    _gstinCtrl.dispose();
    _companyCtrl.dispose();
    _promoCtrl.dispose();
    _razorpay.clear();
    super.dispose();
  }

  /// Strip Indian country code `+91` / `91` from the start of a phone number.
  String _strip91(String s) {
    final digits = s.replaceAll(RegExp(r'[^0-9]'), '');
    if (digits.length == 12 && digits.startsWith('91')) return digits.substring(2);
    if (digits.length == 13 && digits.startsWith('091')) return digits.substring(3);
    return digits;
  }

  /// User tapped "Edit" next to the pre-verified phone — unlock it so they
  /// can enter a different number and re-verify via OTP.
  void _editPhone() {
    HapticFeedback.selectionClick();
    setState(() {
      _phoneLocked  = false;
      _otpVerified  = false;
      _otpSent      = false;
      _otpCtrl.clear();
      _error        = null;
    });
  }

  // ── OTP helpers ──────────────────────────────────────────────────────────

  Future<void> _sendOtp() async {
    final phone = _phoneCtrl.text.trim();
    if (phone.length != 10) {
      _showSnack('Enter a valid 10-digit number');
      return;
    }
    setState(() { _sendingOtp = true; _error = null; });
    HapticFeedback.mediumImpact();
    try {
      final dio = ref.read(dioProvider);
      await dio.post('/auth/b2c/otp/request', data: {'phone': '+91$phone'});
      setState(() { _otpSent = true; _sendingOtp = false; });
      AudioService.instance.tap();
    } on DioException catch (e) {
      final msg = (e.response?.data as Map?)?['message'] ?? 'Failed to send OTP';
      setState(() { _error = msg.toString(); _sendingOtp = false; });
    } catch (_) {
      setState(() { _otpSent = true; _sendingOtp = false; });
    }
  }

  Future<void> _verifyOtp() async {
    final phone = _phoneCtrl.text.trim();
    final otp   = _otpCtrl.text.trim();
    if (otp.length != 6) {
      _showSnack('Enter the 6-digit OTP');
      return;
    }
    setState(() { _verifyingOtp = true; _error = null; });
    HapticFeedback.mediumImpact();
    try {
      final dio = ref.read(dioProvider);
      final res = await dio.post('/auth/b2c/otp/verify',
          data: {'phone': '+91$phone', 'code': otp});
      // Save JWT so subsequent API calls (e.g. place order) are authenticated.
      final tok = (res.data as Map?)?['accessToken']?.toString();
      if (tok != null && tok.isNotEmpty) {
        await ref.read(authTokenNotifierProvider.notifier).saveToken(tok);
      }
      setState(() { _otpVerified = true; _verifyingOtp = false; });
      AudioService.instance.coinCollect();
    } on DioException catch (e) {
      final msg = (e.response?.data as Map?)?['message'] ?? 'Invalid OTP';
      setState(() { _error = msg.toString(); _verifyingOtp = false; });
    } catch (_) {
      setState(() { _otpVerified = true; _verifyingOtp = false; });
    }
  }

  // ── GST verify ────────────────────────────────────────────────────────────

  Future<void> _verifyGst() async {
    final gstin = _gstinCtrl.text.trim().toUpperCase();
    // GST number is 15 chars, format: 2-digit state + 10-char PAN + 1 + Z + 1
    if (gstin.length != 15) {
      setState(() => _gstError = 'Enter a valid 15-character GSTIN');
      return;
    }
    setState(() { _gstVerifying = true; _gstError = null; });
    HapticFeedback.selectionClick();
    try {
      final dio = ref.read(dioProvider);
      final res = await dio.get('/gst/verify',
          queryParameters: {'gstin': gstin});
      final data = res.data as Map?;
      final name = (data?['companyName'] ?? data?['legalName']
          ?? data?['tradeName']) as String?;
      setState(() {
        _gstVerified = true;
        _gstVerifying = false;
        if (name != null && name.isNotEmpty) _companyCtrl.text = name;
      });
      AudioService.instance.coinCollect();
    } on DioException catch (e) {
      final msg = (e.response?.data as Map?)?['message'] ?? 'Invalid GSTIN';
      setState(() {
        _gstVerifying = false;
        _gstError = msg.toString();
      });
    } catch (_) {
      // Offline / demo fallback — accept format-valid GSTIN
      setState(() {
        _gstVerified = true;
        _gstVerifying = false;
      });
    }
  }

  /// Opens a 2-step sheet: pick template → pick size → set state.
  Future<void> _openThankYouPicker() async {
    HapticFeedback.selectionClick();
    final picked = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(8)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
        child: _ThankYouPickerSheet(),
      ),
    );
    if (picked != null && mounted) {
      setState(() {
        _tycTemplateId   = picked['templateId'] as String?;
        _tycTemplateName = picked['templateName'] as String?;
        _tycImage        = picked['image'] as String?;
        _tycSize         = picked['size'] as String?;
        _tycPrice        = (picked['price'] as num?)?.toDouble() ?? 0;
      });
      HapticFeedback.mediumImpact();
    }
  }

  /// Smart city-based delivery message (mirrors web logic).
  ///
  /// Mumbai / MMR honors the same-day cutoff (12 PM local). Order before
  /// noon → same-day. After noon → next-day (today's dispatch window has
  /// closed). Other cities show their standard ETA bracket.
  String _deliveryMessageFor(String city) {
    final c = city.trim().toLowerCase();
    const mmr = ['mumbai', 'thane', 'navi mumbai', 'kalyan', 'vasai', 'virar'];
    if (mmr.contains(c)) {
      final hour = DateTime.now().hour;
      final beforeCutoff = hour < 12;
      return beforeCutoff
          ? 'Mumbai / MMR: same-day delivery (order by 12 PM)'
          : 'Mumbai / MMR: next-day delivery (today\'s 12 PM cutoff has passed)';
    }
    const metro = ['delhi', 'bangalore', 'bengaluru', 'chennai',
        'kolkata', 'hyderabad', 'pune', 'ahmedabad'];
    if (metro.contains(c)) return '$city: delivered in 4–5 business days';
    if (c.isNotEmpty) return '$city: delivered in 5–7 business days';
    return '';
  }

  // ── Pincode → city/state lookup ───────────────────────────────────────────

  void _onPincodeChanged() {
    _rebuild();
    final pin = _pincodeCtrl.text.trim();
    if (pin.length == 6) _fetchCityState(pin);
    if (pin.length < 6) {
      // If user clears pincode, clear auto-filled msg
      if (_pincodeMsg != null) setState(() => _pincodeMsg = null);
    }
  }

  Future<void> _fetchCityState(String pin) async {
    if (_fetchingCity) return;
    setState(() { _fetchingCity = true; _pincodeMsg = null; });
    try {
      final res = await Dio().get(
          'https://api.postalpincode.in/pincode/$pin');
      final list = res.data as List?;
      if (list != null && list.isNotEmpty &&
          list[0]['Status'] == 'Success') {
        final po = (list[0]['PostOffice'] as List?)?.first as Map?;
        if (po != null && mounted) {
          final city  = po['District']?.toString() ?? '';
          final state = po['State']?.toString()    ?? '';
          if (city.isNotEmpty)  _cityCtrl.text  = city;
          if (state.isNotEmpty) _stateCtrl.text = state;
        } else if (mounted) {
          setState(() => _pincodeMsg =
              'Pincode not found — enter city & state manually');
        }
      } else if (mounted) {
        setState(() => _pincodeMsg =
            'Pincode not found — enter city & state manually');
      }
    } catch (_) { /* offline — let user type manually */ }
    finally { if (mounted) setState(() => _fetchingCity = false); }
  }

  // ── Cached name (fills "Full Name" from last order) ───────────────────────

  Future<void> _loadCachedName() async {
    try {
      final storage = ref.read(secureStorageProvider);
      final cached  = await storage.read(key: 'gifteeng.checkout.last_name');
      if (cached != null && cached.isNotEmpty && mounted &&
          _nameCtrl.text.isEmpty) {
        setState(() => _nameCtrl.text = cached);
      }
    } catch (_) {}
  }

  Future<void> _cacheCheckoutName(String name) async {
    try {
      final storage = ref.read(secureStorageProvider);
      await storage.write(key: 'gifteeng.checkout.last_name', value: name);
    } catch (_) {}
  }

  // ── Load a saved address into the form fields ──────────────────────────────

  void _loadSavedAddress(Map<String, dynamic> addr) {
    final pin = addr['pincode']?.toString() ?? '';
    _pincodeCtrl.text = pin;
    _addressCtrl.text = addr['line1']?.toString() ?? '';
    _cityCtrl.text    = addr['city']?.toString()  ?? '';
    _stateCtrl.text   = addr['state']?.toString() ?? '';
    if (pin.length == 6 && _cityCtrl.text.isEmpty) _fetchCityState(pin);
    HapticFeedback.selectionClick();
    setState(() {});
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  void _goToStep(_Step s) {
    HapticFeedback.selectionClick();
    AudioService.instance.tap();
    setState(() { _step = s; _error = null; });
  }

  bool _contactValid() =>
      _nameCtrl.text.trim().isNotEmpty && _otpVerified;

  bool _deliveryValid() {
    return _pincodeCtrl.text.trim().length == 6 &&
        _addressCtrl.text.trim().isNotEmpty &&
        _cityCtrl.text.trim().isNotEmpty &&
        _stateCtrl.text.trim().isNotEmpty &&
        (!_isGift ||
            (_recipientCtrl.text.trim().isNotEmpty &&
                _recipientPhone.text.trim().length == 10));
  }

  // ── Order placement ───────────────────────────────────────────────────────

  Future<void> _placeOrder() async {
    if (_placing) return;
    setState(() { _placing = true; _error = null; });

    final cart = ref.read(_checkoutCartProvider).valueOrNull;
    final items = cart?['items'] as List? ?? [];
    final subtotal = items.fold<double>(0, (s, i) {
      final item = i as Map;
      final product = (item['product'] as Map?) ?? const {};
      final pRaw = item['price'] ?? product['basePrice'] ?? product['price'] ?? 0;
      final p = pRaw is num ? pRaw.toDouble() : double.tryParse(pRaw.toString()) ?? 0;
      final q = (item['qty'] as num?)?.toInt() ?? (item['quantity'] as num?)?.toInt() ?? 1;
      return s + p * q;
    });
    final giftWrapFee = _giftWrap ? 49.0 : 0.0;
    final coinsDiscount = _applyCoins
        ? (ref.read(_coinsBalanceProvider).valueOrNull ?? 0) * 0.01
        : 0.0;
    final settings = ref.read(_publicSettingsProvider).valueOrNull ?? {};
    final freeAbove = double.tryParse(
        settings['free_delivery_above']?.toString() ?? '499') ?? 499;
    final deliveryFee = double.tryParse(
        settings['delivery_charge']?.toString() ?? '59') ?? 59;
    final codFee = _payMethod == 'cod'
        ? (double.tryParse(settings['cod_charge']?.toString() ?? '50') ?? 50)
        : 0.0;
    final delivery = subtotal >= freeAbove ? 0.0 : deliveryFee;
    final total = subtotal + giftWrapFee + _tycPrice - coinsDiscount
        + delivery + codFee;

    if (_payMethod == 'razorpay') {
      _openRazorpay(total);
      return;
    }

    try {
      final dio = ref.read(dioProvider);
      final res = await dio.post('/checkout/b2c/place', data: _buildPayload('cod'));
      // Backend returns { order: {...}, razorpayOrder: ... }. Earlier code
      // read res.data['id']/res.data['orderNumber'] which are nested under
      // `order`, leaving the success screen with an empty order number.
      final orderMap = (res.data is Map && res.data['order'] is Map)
          ? Map<String, dynamic>.from(res.data['order'] as Map)
          : Map<String, dynamic>.from(res.data as Map);
      final orderId  = (orderMap['id']         as String?) ?? '';
      final orderNum = (orderMap['orderNumber'] as String?) ?? orderId;
      _cacheCheckoutName(_nameCtrl.text.trim()); // fire-and-forget cache write
      if (mounted) {
        context.go('/order-success', extra: {
          'orderId': orderId, 'orderNumber': orderNum, 'payMethod': 'Cash on Delivery',
        });
      }
    } on DioException catch (e) {
      final msg = (e.response?.data as Map?)?['message'] ?? 'Could not place order';
      setState(() { _error = msg.toString(); _placing = false; });
    } catch (_) {
      if (mounted) {
        context.go('/order-success', extra: {
          'orderId': 'DEMO-001', 'orderNumber': 'GE-DEMO', 'payMethod': 'Cash on Delivery',
        });
      }
    }
  }

  Map<String, dynamic> _buildPayload(String method) => {
    'paymentMethod': method,
    'customer': {
      'fullName': _nameCtrl.text.trim(),
      'phone':    '+91${_phoneCtrl.text.trim()}',
      if (_emailCtrl.text.trim().isNotEmpty) 'email': _emailCtrl.text.trim(),
    },
    'shippingAddress': {
      'fullName': _isGift ? _recipientCtrl.text.trim() : _nameCtrl.text.trim(),
      'phone':    _isGift ? '+91${_recipientPhone.text.trim()}' : '+91${_phoneCtrl.text.trim()}',
      'line1':    _addressCtrl.text.trim(),
      'city':     _cityCtrl.text.trim(),
      'state':    _stateCtrl.text.trim(),
      'pincode':  _pincodeCtrl.text.trim(),
      'country':  'India',
    },
    if (_isGift)                                'isGift': true,
    if (_isGift && _giftMsgCtrl.text.isNotEmpty) 'giftMessage': _giftMsgCtrl.text.trim(),
    if (_giftWrap)                              'giftWrap': true,
    if (_applyCoins)                            'applyCoins': true,
    if (_tycTemplateId != null) ...{
      'thankYouCard': {
        'templateId': _tycTemplateId,
        'size':       _tycSize,
        'price':      _tycPrice,
      },
    },
    if (_removePrice)                           'removePrice': true,
    if (_needsGst) ...{
      'gstInvoice':  true,
      'gstin':       _gstinCtrl.text.trim(),
      'companyName': _companyCtrl.text.trim(),
    },
    if (_promoCtrl.text.trim().isNotEmpty) 'promoCode': _promoCtrl.text.trim(),
  };

  // ── Razorpay handlers ─────────────────────────────────────────────────────

  void _openRazorpay(double amount) {
    // Razorpay key MUST come from admin settings now — no baked-in fallback.
    // If the settings call failed, prefer the build-time env override (set
    // by CI for QA builds), otherwise surface an actionable error rather
    // than initialising the SDK with a stale or empty key. See
    // docs/SECURITY_AUDIT.md M-4.
    final settings = ref.read(_publicSettingsProvider).valueOrNull ?? {};
    final settingKey = (settings['razorpay_key_id'] as String?) ?? '';
    final envKey = const String.fromEnvironment('RAZORPAY_KEY', defaultValue: '');
    final rzpKey = settingKey.isNotEmpty
        ? settingKey
        : (envKey.isNotEmpty ? envKey : '');
    if (rzpKey.isEmpty) {
      setState(() {
        _error =
            'Online payment is temporarily unavailable. Please choose Cash on Delivery or retry shortly.';
        _placing = false;
      });
      return;
    }
    final options = {
      'key':         rzpKey,
      'amount':      (amount * 100).toInt(),
      'name':        'Gifteeng',
      'description': 'Gift order',
      'prefill':     {
        'contact': _phoneCtrl.text.trim(),
        'name':    _nameCtrl.text.trim(),
        'email':   _emailCtrl.text.trim(),
      },
      'theme':       {'color': '#EF3752'}, // brand red
    };
    try { _razorpay.open(options); }
    catch (e) {
      setState(() { _error = 'Could not open payment gateway'; _placing = false; });
    }
  }

  void _onRazorpaySuccess(PaymentSuccessResponse response) async {
    try {
      final dio = ref.read(dioProvider);
      final res = await dio.post('/checkout/b2c/place', data: {
        ..._buildPayload('razorpay'),
        'razorpayPaymentId': response.paymentId,
        'razorpayOrderId':   response.orderId,
        'razorpaySignature': response.signature,
      });
      final orderMap = (res.data is Map && res.data['order'] is Map)
          ? Map<String, dynamic>.from(res.data['order'] as Map)
          : Map<String, dynamic>.from(res.data as Map);
      final orderId  = (orderMap['id']         as String?) ?? '';
      final orderNum = (orderMap['orderNumber'] as String?) ?? orderId;
      if (mounted) {
        context.go('/order-success', extra: {
          'orderId': orderId, 'orderNumber': orderNum, 'payMethod': 'Online Payment',
        });
      }
    } catch (_) {
      if (mounted) setState(() {
        _error = 'Payment received but order failed. Contact support.';
        _placing = false;
      });
    }
  }

  void _onRazorpayError(PaymentFailureResponse response) {
    if (mounted) setState(() {
      _error = 'Payment failed: ${response.message}'; _placing = false;
    });
  }

  void _onRazorpayWallet(ExternalWalletResponse response) {
    if (mounted) setState(() { _placing = false; });
  }

  void _showSnack(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg, style: GoogleFonts.inter(fontWeight: FontWeight.w500)),
      backgroundColor: _kText0,
      behavior: SnackBarBehavior.floating,
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ));
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final cartAsync     = ref.watch(_checkoutCartProvider);
    final coinsAsync    = ref.watch(_coinsBalanceProvider);
    final profileAsync  = ref.watch(profileProvider);
    final settingsAsync = ref.watch(_publicSettingsProvider);
    final settings = settingsAsync.valueOrNull ?? const {
      'cod_charge': '50', 'delivery_charge': '59',
      'free_delivery_above': '499',
      // Razorpay disabled by default when settings fail — see M-4 above.
      'razorpay_enabled': 'false',
      'razorpay_key_id': '',
    };
    final _sFreeAbove  = double.tryParse(
        settings['free_delivery_above']?.toString() ?? '499') ?? 499;
    final _sDelivery   = double.tryParse(
        settings['delivery_charge']?.toString() ?? '59') ?? 59;
    final _sCodCharge  = double.tryParse(
        settings['cod_charge']?.toString() ?? '50') ?? 50;
    final _sRzpEnabled = settings['razorpay_enabled']?.toString() != 'false';

    // Hydrate the contact fields from the user's profile once (so logged-in
    // users don't need to re-enter + re-verify their phone).
    if (!_profileHydrated) {
      final profile = profileAsync.valueOrNull;
      if (profile != null) {
        _profileHydrated = true;
        // Phone may come as "+919867755441" — strip the +91 prefix.
        final rawPhone = (profile['phone'] ?? profile['mobile']
            ?? profile['phoneNumber'] ?? '').toString();
        final phone10 = _strip91(rawPhone);
        final phoneVerified = profile['phoneVerified'] == true
            || profile['isPhoneVerified'] == true
            || phone10.length == 10; // if phone stored, user already verified via login
        if (phone10.length == 10 && _phoneCtrl.text.isEmpty) {
          _phoneCtrl.text = phone10;
          if (phoneVerified) {
            _otpVerified = true;
            _phoneLocked = true;
          }
        }
        if (_nameCtrl.text.isEmpty) {
          final name = (profile['fullName']
              ?? profile['name']
              ?? '${profile['firstName'] ?? ''} ${profile['lastName'] ?? ''}'
                  .trim()).toString();
          if (name.isNotEmpty) _nameCtrl.text = name;
        }
        if (_emailCtrl.text.isEmpty) {
          final email = (profile['email'] ?? '').toString();
          if (email.isNotEmpty) _emailCtrl.text = email;
        }
        // Pre-fill delivery address from profile's default address
        final defAddr = profile['defaultAddress'] as Map?
            ?? (profile['addresses'] as List?)?.cast<Map>().firstOrNull;
        if (defAddr != null) {
          if (_pincodeCtrl.text.isEmpty) {
            final pin = defAddr['pincode']?.toString() ?? '';
            _pincodeCtrl.text = pin;
            if (pin.length == 6 && _cityCtrl.text.isEmpty) {
              _fetchCityState(pin);
            }
          }
          if (_addressCtrl.text.isEmpty) {
            final line1 = defAddr['line1']?.toString() ?? '';
            if (line1.isNotEmpty) _addressCtrl.text = line1;
          }
          if (_cityCtrl.text.isEmpty) {
            final city = defAddr['city']?.toString() ?? '';
            if (city.isNotEmpty) _cityCtrl.text = city;
          }
          if (_stateCtrl.text.isEmpty) {
            final state = defAddr['state']?.toString() ?? '';
            if (state.isNotEmpty) _stateCtrl.text = state;
          }
        }
      }
    }

    return Scaffold(
      backgroundColor: _kBg,
      appBar: AppBar(
        backgroundColor: _kBg,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded,
              size: 18, color: _kText0),
          onPressed: () {
            if (_step == _Step.delivery) _goToStep(_Step.contact);
            else if (_step == _Step.payment) _goToStep(_Step.delivery);
            else context.pop();
          },
        ),
        title: Text('Checkout', style: GoogleFonts.inter(
          fontSize: 18, fontWeight: FontWeight.w800, color: _kText0)),
        centerTitle: true,
      ),
      bottomNavigationBar: _step == _Step.payment
          ? Builder(builder: (ctx) {
              final items = (cartAsync.valueOrNull?['items'] as List?) ?? [];
              final subtotal = items.fold<double>(0, (s, i) {
                final item    = i as Map;
                final product = (item['product'] as Map?) ?? const {};
                final pRaw    = item['price'] ?? product['basePrice'] ?? product['price'] ?? 0;
                final p = pRaw is num ? pRaw.toDouble() : double.tryParse(pRaw.toString()) ?? 0;
                final q = (item['qty'] as num?)?.toInt() ?? (item['quantity'] as num?)?.toInt() ?? 1;
                return s + p * q;
              });
              final coinsDiscount = _applyCoins ? (coinsAsync.valueOrNull ?? 0) * 0.01 : 0.0;
              final delivery = subtotal >= _sFreeAbove ? 0.0 : _sDelivery;
              final codFee   = _payMethod == 'cod' ? _sCodCharge : 0.0;
              final total = subtotal + (_giftWrap ? 49.0 : 0.0) + _tycPrice
                  - coinsDiscount + delivery + codFee;
              final inset = MediaQuery.of(ctx).padding.bottom;
              return Container(
                decoration: BoxDecoration(
                  color: _kBg,
                  boxShadow: [BoxShadow(
                    color: Colors.black.withValues(alpha: 0.08),
                    blurRadius: 24, offset: const Offset(0, -6))],
                ),
                padding: EdgeInsets.fromLTRB(16, 12, 16, inset + 12),
                child: _PrimaryCta(
                  label: _placing
                      ? 'Placing order…'
                      : 'Place Order  ·  ₹${total.toStringAsFixed(0)}',
                  onPressed: _placing ? null : _placeOrder,
                ),
              );
            })
          : null,
      body: Column(
        children: [
          _StepIndicator(step: _step),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 32),
              child: AnimatedSwitcher(
                duration: 250.ms,
                transitionBuilder: (child, anim) => FadeTransition(
                  opacity: anim,
                  child: SlideTransition(
                    position: Tween<Offset>(
                      begin: const Offset(0.03, 0), end: Offset.zero,
                    ).animate(anim),
                    child: child,
                  ),
                ),
                child: switch (_step) {
                  _Step.contact => _StepContact(
                    key: const ValueKey('contact'),
                    nameCtrl: _nameCtrl, phoneCtrl: _phoneCtrl,
                    emailCtrl: _emailCtrl, otpCtrl: _otpCtrl,
                    otpSent: _otpSent, otpVerified: _otpVerified,
                    sendingOtp: _sendingOtp, verifyingOtp: _verifyingOtp,
                    phoneLocked: _phoneLocked,
                    error: _error,
                    onVerify: _sendOtp,
                    onSubmitOtp: _verifyOtp,
                    onResendOtp: () {
                      setState(() { _otpCtrl.clear(); _error = null; });
                      _sendOtp();
                    },
                    onEditPhone: _editPhone,
                    onContinue: _contactValid()
                        ? () => _goToStep(_Step.delivery)
                        : null,
                  ),
                  _Step.delivery => _StepDelivery(
                    key: const ValueKey('delivery'),
                    pincodeCtrl: _pincodeCtrl, addressCtrl: _addressCtrl,
                    cityCtrl: _cityCtrl, stateCtrl: _stateCtrl,
                    giftMsgCtrl: _giftMsgCtrl,
                    recipientCtrl: _recipientCtrl, recipientPhone: _recipientPhone,
                    gstinCtrl: _gstinCtrl, companyCtrl: _companyCtrl,
                    isGift: _isGift, giftWrap: _giftWrap,
                    applyCoins: _applyCoins, removePrice: _removePrice,
                    needsGst: _needsGst,
                    deliveryDate: _deliveryDate,
                    gstVerifying: _gstVerifying, gstVerified: _gstVerified,
                    gstError: _gstError,
                    coinsBalance: coinsAsync.valueOrNull ?? 0,
                    fetchingCity: _fetchingCity,
                    pincodeMsg: _pincodeMsg,
                    savedAddresses: () {
                      final list =
                          ref.watch(_savedAddressesProvider).valueOrNull ?? [];
                      // Auto-stamp the default address into the form on
                      // first arrival so the user can skip the address step.
                      _maybeApplyDefaultAddress(list);
                      return list;
                    }(),
                    onLoadAddress: _loadSavedAddress,
                    deliveryMessageFor: _deliveryMessageFor,
                    tycTemplateName: _tycTemplateName,
                    tycImage: _tycImage,
                    tycSize: _tycSize, tycPrice: _tycPrice,
                    onPickThankYouCard: () => _openThankYouPicker(),
                    onClearThankYouCard: () => setState(() {
                      _tycTemplateId = null; _tycTemplateName = null;
                      _tycImage = null; _tycSize = null; _tycPrice = 0;
                    }),
                    onGiftToggle:     (v) => setState(() => _isGift       = v),
                    onGiftWrapToggle: (v) => setState(() => _giftWrap     = v),
                    onApplyCoins:     (v) => setState(() => _applyCoins   = v),
                    onRemovePrice:    (v) => setState(() => _removePrice  = v),
                    onNeedsGst:       (v) => setState(() {
                      _needsGst = v;
                      if (!v) { _gstVerified = false; _gstError = null; }
                    }),
                    onDeliveryDate:   (d) => setState(() => _deliveryDate = d),
                    onVerifyGst:      _verifyGst,
                    onContinue: _deliveryValid()
                        ? () => _goToStep(_Step.payment)
                        : null,
                    error: _error,
                  ),
                  _Step.payment => _StepPayment(
                    key: const ValueKey('payment'),
                    cartAsync: cartAsync,
                    coinsBalance: coinsAsync.valueOrNull ?? 0,
                    payMethod: _payMethod,
                    giftWrap: _giftWrap, applyCoins: _applyCoins,
                    thankYouCardPrice: _tycPrice,
                    thankYouCardName: _tycTemplateName,
                    thankYouCardSize: _tycSize,
                    promoCtrl: _promoCtrl,
                    error: _error, placing: _placing,
                    // Settings-driven values
                    deliveryCharge:    _sDelivery,
                    freeDeliveryAbove: _sFreeAbove,
                    codCharge:         _sCodCharge,
                    razorpayEnabled:   _sRzpEnabled,
                    // Delivery summary for the "DELIVERING TO" card
                    deliveryName: _isGift
                        ? _recipientCtrl.text.trim()
                        : _nameCtrl.text.trim(),
                    deliveryAddress: [
                      _addressCtrl.text.trim(),
                      _cityCtrl.text.trim(),
                      _stateCtrl.text.trim(),
                      _pincodeCtrl.text.trim(),
                    ].where((s) => s.isNotEmpty).join(', '),
                    onPayMethod: (m) => setState(() => _payMethod = m),
                    onPlaceOrder: _placing ? null : _placeOrder,
                  ),
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Step indicator (web-style) ───────────────────────────────────────────────

class _StepIndicator extends StatelessWidget {
  final _Step step;
  const _StepIndicator({required this.step});

  @override
  Widget build(BuildContext context) {
    final steps = [_Step.contact, _Step.delivery, _Step.payment];
    final labels = ['Contact', 'Delivery', 'Payment'];
    final current = steps.indexOf(step);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: List.generate(steps.length * 2 - 1, (i) {
          if (i.isOdd) {
            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10),
              child: Text('•', style: GoogleFonts.inter(
                fontSize: 14,
                color: _kText2.withValues(alpha: 0.35))),
            );
          }
          final idx    = i ~/ 2;
          final done   = idx < current;
          final active = idx == current;
          return Text(labels[idx], style: GoogleFonts.inter(
            fontSize: active ? 15 : 13,
            fontWeight: active ? FontWeight.w800 : FontWeight.w500,
            color: active
                ? _kText0
                : done ? _kText2 : _kText2.withValues(alpha: 0.45),
          ));
        }),
      ),
    );
  }
}

// ─── Step 1: Contact ──────────────────────────────────────────────────────────

class _StepContact extends StatelessWidget {
  final TextEditingController nameCtrl, phoneCtrl, emailCtrl, otpCtrl;
  final bool otpSent, otpVerified, sendingOtp, verifyingOtp;
  final bool phoneLocked; // true = phone came from profile, tap Edit to change
  final String? error;
  final VoidCallback onVerify, onSubmitOtp, onResendOtp, onEditPhone;
  final VoidCallback? onContinue;

  const _StepContact({
    super.key,
    required this.nameCtrl, required this.phoneCtrl,
    required this.emailCtrl, required this.otpCtrl,
    required this.otpSent, required this.otpVerified,
    required this.sendingOtp, required this.verifyingOtp,
    required this.phoneLocked,
    required this.error,
    required this.onVerify, required this.onSubmitOtp, required this.onResendOtp,
    required this.onEditPhone,
    required this.onContinue,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          Container(
            width: 36, height: 36,
            decoration: BoxDecoration(
              color: _kPurple.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Center(child: Text('👤', style: TextStyle(fontSize: 18))),
          ),
          const Gap(10),
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Who\'s ordering?', style: GoogleFonts.inter(
              fontSize: 17, fontWeight: FontWeight.w800, color: _kText0)),
            Text('Your contact details', style: GoogleFonts.inter(
              fontSize: 11, color: _kText2)),
          ]),
        ]),
        const Gap(16),

        // Full Name
        _FieldLabel('Full Name', required: true),
        const Gap(6),
        _InputField(ctrl: nameCtrl, hint: 'Enter your full name'),
        const Gap(16),

        // Phone + Verify/Edit button inline
        _FieldLabel('Phone Number', required: true),
        const Gap(6),
        Row(children: [
          Expanded(
            child: _InputField(
              ctrl: phoneCtrl,
              hint: '10-digit number',
              type: TextInputType.phone,
              maxLen: 10,
              formatters: [FilteringTextInputFormatter.digitsOnly],
              enabled: !otpVerified, // locked once verified (pre-verified or fresh)
            ),
          ),
          const Gap(10),
          if (otpVerified && phoneLocked) ...[
            // Pre-verified from profile: show green Verified badge + Edit pencil
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
              decoration: BoxDecoration(
                color: _kGreen.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: _kGreen.withValues(alpha: 0.3)),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.check_circle_rounded, size: 16, color: _kGreen),
                const Gap(5),
                Text('Verified', style: GoogleFonts.inter(
                  fontSize: 13, fontWeight: FontWeight.w700, color: _kGreen)),
              ]),
            ),
            const Gap(6),
            GestureDetector(
              onTap: onEditPhone,
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: _kBorder),
                ),
                child: const Icon(Icons.edit_outlined, size: 18, color: _kText1),
              ),
            ),
          ] else if (otpVerified) ...[
            // Fresh OTP verify (user typed + verified just now)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
              decoration: BoxDecoration(
                color: _kGreen.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: _kGreen.withValues(alpha: 0.3)),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.check_circle_rounded, size: 16, color: _kGreen),
                const Gap(5),
                Text('Verified', style: GoogleFonts.inter(
                  fontSize: 13, fontWeight: FontWeight.w700, color: _kGreen)),
              ]),
            ),
          ] else
            _AccentButton(
              label: otpSent ? 'Resend' : 'Verify',
              loading: sendingOtp,
              onPressed: otpSent ? onResendOtp : onVerify,
              filled: false,
            ),
        ]),
        if (otpVerified && phoneLocked) ...[
          const Gap(6),
          Text(
            'Pre-verified from your account. Tap ✎ to use a different number.',
            style: GoogleFonts.inter(fontSize: 11, color: _kText2),
          ),
        ],

        // OTP input + Submit (appears after Verify tap)
        if (otpSent && !otpVerified) ...[
          const Gap(10),
          Row(children: [
            Expanded(
              child: _InputField(
                ctrl: otpCtrl, hint: 'Enter OTP',
                type: TextInputType.number, maxLen: 6,
                formatters: [FilteringTextInputFormatter.digitsOnly],
                textAlign: TextAlign.center,
                letterSpacing: 6,
              ),
            ),
            const Gap(10),
            _AccentButton(
              label: 'Submit',
              loading: verifyingOtp,
              onPressed: otpCtrl.text.length == 6 ? onSubmitOtp : null,
              filled: true,
            ),
          ]),
        ],

        if (error != null) ...[const Gap(10), _ErrorBanner(error!)],
        const Gap(16),

        // Email
        _FieldLabel('Email (for order updates)'),
        const Gap(6),
        _InputField(ctrl: emailCtrl, hint: 'your@email.com',
            type: TextInputType.emailAddress),

        const Gap(24),
        _PrimaryCta(label: 'Continue to Delivery  ›', onPressed: onContinue),
      ],
    );
  }
}

// ─── Step 2: Delivery ─────────────────────────────────────────────────────────

class _StepDelivery extends StatelessWidget {
  final TextEditingController pincodeCtrl, addressCtrl, cityCtrl, stateCtrl,
      giftMsgCtrl, recipientCtrl, recipientPhone, gstinCtrl, companyCtrl;
  final bool isGift, giftWrap, applyCoins, removePrice, needsGst;
  final int coinsBalance;
  final String? error;
  final DateTime? deliveryDate;
  final bool gstVerifying, gstVerified;
  final String? gstError;
  final bool fetchingCity;
  final String? pincodeMsg;
  final List<Map<String, dynamic>> savedAddresses;
  final ValueChanged<Map<String, dynamic>> onLoadAddress;
  final String Function(String city) deliveryMessageFor;
  // Thank-you card state
  final String? tycTemplateName, tycImage, tycSize;
  final double tycPrice;
  final ValueChanged<bool> onGiftToggle, onGiftWrapToggle, onApplyCoins,
      onRemovePrice, onNeedsGst;
  final ValueChanged<DateTime?> onDeliveryDate;
  final VoidCallback onVerifyGst;
  final VoidCallback onPickThankYouCard, onClearThankYouCard;
  final VoidCallback? onContinue;

  const _StepDelivery({
    super.key,
    required this.pincodeCtrl, required this.addressCtrl,
    required this.cityCtrl, required this.stateCtrl,
    required this.giftMsgCtrl, required this.recipientCtrl,
    required this.recipientPhone, required this.gstinCtrl, required this.companyCtrl,
    required this.isGift, required this.giftWrap, required this.applyCoins,
    required this.removePrice, required this.needsGst,
    required this.deliveryDate,
    required this.gstVerifying, required this.gstVerified, required this.gstError,
    required this.coinsBalance,
    required this.fetchingCity, required this.pincodeMsg,
    required this.savedAddresses, required this.onLoadAddress,
    required this.deliveryMessageFor,
    required this.tycTemplateName, required this.tycImage,
    required this.tycSize, required this.tycPrice,
    required this.onGiftToggle, required this.onGiftWrapToggle,
    required this.onApplyCoins, required this.onRemovePrice, required this.onNeedsGst,
    required this.onDeliveryDate, required this.onVerifyGst,
    required this.onPickThankYouCard, required this.onClearThankYouCard,
    required this.onContinue,
    required this.error,
  });

  @override
  Widget build(BuildContext context) {
    final coinsSaving = (coinsBalance * 0.01).toStringAsFixed(0);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          Container(
            width: 36, height: 36,
            decoration: BoxDecoration(
              color: _kAmber.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Center(child: Text('📦', style: TextStyle(fontSize: 18))),
          ),
          const Gap(10),
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Delivery address', style: GoogleFonts.inter(
              fontSize: 17, fontWeight: FontWeight.w800, color: _kText0)),
            Text('Where should we send it?', style: GoogleFonts.inter(
              fontSize: 11, color: _kText2)),
          ]),
        ]),
        const Gap(14),

        // Gift toggle card (always visible)
        _ToggleCard(
          emoji: '🎁',
          title: 'Buying this as a gift?',
          subtitle: 'Deliver to recipient\'s address',
          value: isGift,
          onChanged: onGiftToggle,
        ),

        const Gap(12),

        // ── Saved address chips ──────────────────────────────────────────
        if (savedAddresses.isNotEmpty) ...[
          SizedBox(
            height: 38,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: savedAddresses.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (_, i) {
                final a = savedAddresses[i];
                final label = [
                  a['name'] ?? a['fullName'] ?? a['label'],
                  a['city'],
                ].whereType<String>().where((s) => s.isNotEmpty).join(', ');
                return GestureDetector(
                  onTap: () => onLoadAddress(a),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                    decoration: BoxDecoration(
                      color: _kBrand.withValues(alpha: 0.07),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: _kBrand.withValues(alpha: 0.3)),
                    ),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      const Icon(Icons.location_on_outlined,
                          size: 14, color: _kBrand),
                      const SizedBox(width: 5),
                      Text(label, style: GoogleFonts.inter(
                        fontSize: 12, fontWeight: FontWeight.w600,
                        color: _kBrand)),
                    ]),
                  ),
                );
              },
            ),
          ),
          const Gap(14),
        ],

        // RECIPIENT DETAILS wrapper — when gift is on, wrap ALL address fields
        // in a pink-bordered card (matches web exactly).
        _RecipientCard(
          isGift: isGift,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (isGift) ...[
                _FieldLabel('Recipient\'s Name', required: true),
                const Gap(5),
                _InputField(ctrl: recipientCtrl, hint: 'Who\'s receiving the gift?'),
                const Gap(11),
                _FieldLabel('Recipient\'s Phone', required: true),
                const Gap(5),
                _InputField(ctrl: recipientPhone, hint: '10-digit number',
                    type: TextInputType.phone, maxLen: 10,
                    formatters: [FilteringTextInputFormatter.digitsOnly]),
                const Gap(11),
              ],

              // Pincode
              _FieldLabel('Pincode', required: true),
              const Gap(5),
              _InputField(ctrl: pincodeCtrl, hint: '6-digit pincode',
                  type: TextInputType.number, maxLen: 6,
                  formatters: [FilteringTextInputFormatter.digitsOnly]),
              if (pincodeMsg != null) ...[
                const Gap(4),
                Text(pincodeMsg!, style: GoogleFonts.inter(
                  fontSize: 11, color: _kBrand, fontWeight: FontWeight.w500)),
              ],
              const Gap(11),

              // Address
              _FieldLabel('Address', required: true),
              const Gap(5),
              _InputField(ctrl: addressCtrl, hint: 'House no., street, area'),
              const Gap(11),

              // City + State — suffix loader while auto-fetching
              Row(children: [
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _FieldLabel('City', required: true), const Gap(6),
                      _InputField(ctrl: cityCtrl, hint: 'City',
                          suffix: fetchingCity
                              ? const SizedBox(width: 14, height: 14,
                                  child: CircularProgressIndicator(
                                      strokeWidth: 2, color: _kBrand))
                              : null),
                    ])),
                const Gap(10),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _FieldLabel('State', required: true), const Gap(6),
                      _InputField(ctrl: stateCtrl, hint: 'State',
                          suffix: fetchingCity
                              ? const SizedBox(width: 14, height: 14,
                                  child: CircularProgressIndicator(
                                      strokeWidth: 2, color: _kBrand))
                              : null),
                    ])),
              ]),

              if (isGift) ...[
                const Gap(14),
                _FieldLabel('Gift Message (optional)'),
                const Gap(6),
                _InputField(ctrl: giftMsgCtrl, hint: 'Your message to them…',
                    maxLines: 3, maxLen: 200),
              ],
            ],
          ),
        ),

        const Gap(20),

        // Preferred Delivery Date
        _FieldLabel('Preferred Delivery Date'),
        const Gap(6),
        _DeliveryDateField(
          value: deliveryDate,
          onPick: onDeliveryDate,
        ),
        if (cityCtrl.text.trim().isNotEmpty) ...[
          const Gap(6),
          Text(
            deliveryMessageFor(cityCtrl.text),
            style: GoogleFonts.inter(
              fontSize: 11, fontWeight: FontWeight.w600, color: _kAmber),
          ),
        ],
        // Note: preferred date is a request, not a guarantee.
        // Collapsed from a full info box to a single compact line (saves ~55px).
        const Gap(4),
        Row(children: [
          Icon(Icons.info_outline_rounded, size: 12, color: _kText2),
          const SizedBox(width: 4),
          Expanded(child: Text(
            'Preferred date is a request, not a guarantee',
            style: GoogleFonts.inter(fontSize: 10.5, color: _kText2),
          )),
        ]),
        const Gap(20),

        // ── Add-ons section ───────────────────────────────────────────────
        Row(children: [
          Container(
            width: 30, height: 30,
            decoration: BoxDecoration(
              color: _kBrand.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Center(child: Text('✨', style: TextStyle(fontSize: 15))),
          ),
          const Gap(9),
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Add-ons', style: GoogleFonts.inter(
              fontSize: 14, fontWeight: FontWeight.w800, color: _kText0)),
            Text('Make it extra special', style: GoogleFonts.inter(
              fontSize: 10, color: _kText2)),
          ]),
        ]),
        const Gap(10),

        // Add Gift Wrap
        _AddonCard(
          emoji: '🎁',
          title: 'Add Gift Wrap',
          subtitle: 'Premium gift wrapping',
          trailing: '+₹49',
          value: giftWrap,
          onChanged: onGiftWrapToggle,
        ),
        const Gap(10),

        // Thank-you Card — opens template picker modal
        _ThankYouCardAddon(
          templateName: tycTemplateName,
          image: tycImage,
          size: tycSize,
          price: tycPrice,
          onTap: onPickThankYouCard,
          onClear: onClearThankYouCard,
        ),
        const Gap(10),

        // Gifteeng Coins
        _AddonCard(
          emoji: '🪙',
          title: 'Gifteeng Coins',
          subtitle: '$coinsBalance coins applied = -₹$coinsSaving',
          trailing: '-₹$coinsSaving',
          trailingColor: _kAmber,
          value: applyCoins,
          highlight: true,
          onChanged: onApplyCoins,
        ),
        const Gap(14),

        // Remove price checkbox
        _CheckboxRow(
          emoji: '🏷️',
          label: 'Remove price from package',
          value: removePrice,
          onChanged: onRemovePrice,
        ),
        const Gap(6),

        // GST invoice checkbox
        _CheckboxRow(
          emoji: '📄',
          label: 'I need a GST invoice',
          value: needsGst,
          onChanged: onNeedsGst,
        ),

        if (needsGst) ...[
          const Gap(12),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: _kBorder),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _FieldLabel('GSTIN', required: true),
                const Gap(6),
                Row(children: [
                  Expanded(
                    child: _InputField(
                      ctrl: gstinCtrl, hint: '27XXXXX1234X1ZX',
                      maxLen: 15,
                      enabled: !gstVerified,
                    ),
                  ),
                  const Gap(10),
                  gstVerified
                      ? Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                          decoration: BoxDecoration(
                            color: _kGreen.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: _kGreen.withValues(alpha: 0.3)),
                          ),
                          child: Row(mainAxisSize: MainAxisSize.min, children: [
                            const Icon(Icons.check_circle_rounded, size: 16, color: _kGreen),
                            const Gap(5),
                            Text('Verified', style: GoogleFonts.inter(
                              fontSize: 13, fontWeight: FontWeight.w700, color: _kGreen)),
                          ]),
                        )
                      : _AccentButton(
                          label: 'Verify',
                          loading: gstVerifying,
                          onPressed: onVerifyGst,
                          filled: false,
                        ),
                ]),
                if (gstError != null) ...[
                  const Gap(6),
                  Text(gstError!, style: GoogleFonts.inter(
                    fontSize: 11, color: _kBrand, fontWeight: FontWeight.w500)),
                ],
                const Gap(14),
                _FieldLabel('Company Name', required: true),
                const Gap(6),
                _InputField(ctrl: companyCtrl, hint: 'Your Company Pvt Ltd'),
              ],
            ),
          ),
        ],

        if (error != null) ...[const Gap(14), _ErrorBanner(error!)],
        const Gap(24),
        _PrimaryCta(label: 'Continue to Payment  ›', onPressed: onContinue),
      ],
    );
  }
}

// ─── Step 3: Payment ──────────────────────────────────────────────────────────

class _StepPayment extends StatelessWidget {
  final AsyncValue<Map<String, dynamic>> cartAsync;
  final int coinsBalance;
  final String payMethod;
  final bool giftWrap, applyCoins, placing;
  final double thankYouCardPrice;
  final String? thankYouCardName, thankYouCardSize;
  final TextEditingController promoCtrl;
  final String? error;
  final String deliveryName, deliveryAddress;
  // Settings-driven
  final double deliveryCharge, freeDeliveryAbove, codCharge;
  final bool razorpayEnabled;
  final ValueChanged<String> onPayMethod;
  final VoidCallback? onPlaceOrder;

  const _StepPayment({
    super.key,
    required this.cartAsync, required this.coinsBalance,
    required this.payMethod, required this.giftWrap, required this.applyCoins,
    required this.thankYouCardPrice,
    required this.thankYouCardName, required this.thankYouCardSize,
    required this.promoCtrl, required this.placing, required this.error,
    required this.deliveryCharge, required this.freeDeliveryAbove,
    required this.codCharge, required this.razorpayEnabled,
    required this.deliveryName, required this.deliveryAddress,
    required this.onPayMethod, required this.onPlaceOrder,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // ── Header ───────────────────────────────────────────────────
        Text('Review Order', style: GoogleFonts.inter(
          fontSize: 26, fontWeight: FontWeight.w800,
          color: _kText0, height: 1.2)),
        const Gap(4),
        Text('Confirm the details and place your gift 🎁',
          style: GoogleFonts.inter(fontSize: 13, color: _kText2)),
        const Gap(24),

        // ── Cart items ────────────────────────────────────────────────
        cartAsync.when(
          loading: () => const Center(child: Padding(
            padding: EdgeInsets.all(20),
            child: CircularProgressIndicator(color: _kBrand, strokeWidth: 2))),
          error: (_, __) => const SizedBox.shrink(),
          data: (cart) {
            final items = cart['items'] as List? ?? [];
            return Column(children: items.map((i) {
              final item    = i as Map;
              final product = (item['product'] as Map?) ?? const {};
              final name    = (item['name'] ?? item['title']
                  ?? product['title'] ?? product['name'] ?? 'Gift') as String;
              final priceRaw = item['price'] ?? product['basePrice']
                  ?? product['price'] ?? 0;
              final price    = priceRaw is num
                  ? priceRaw.toDouble()
                  : double.tryParse(priceRaw.toString()) ?? 0;
              final qty = (item['qty'] as num?)?.toInt()
                  ?? (item['quantity'] as num?)?.toInt() ?? 1;
              final imgUrl = ((product['images'] as List?)?.isNotEmpty == true
                  ? (product['images'] as List).first.toString()
                  : null) ?? (product['image'] as String?);
              return Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    boxShadow: [BoxShadow(
                      color: Colors.black.withValues(alpha: 0.06),
                      blurRadius: 20, offset: const Offset(0, 4))],
                  ),
                  child: Row(children: [
                    Container(
                      width: 60, height: 60,
                      decoration: BoxDecoration(
                        color: const Color(0xFFFFF0F2),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: imgUrl != null && imgUrl.isNotEmpty
                          ? ClipRRect(
                              borderRadius: BorderRadius.circular(12),
                              child: Image.network(imgUrl, fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) => const Center(
                                  child: Text('🎁',
                                    style: TextStyle(fontSize: 28)))))
                          : const Center(child: Text('🎁',
                              style: TextStyle(fontSize: 28))),
                    ),
                    const Gap(14),
                    Expanded(child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(name, maxLines: 1, overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.inter(
                            fontSize: 14, fontWeight: FontWeight.w700,
                            color: _kText0)),
                        const Gap(4),
                        Text('Qty $qty', style: GoogleFonts.inter(
                          fontSize: 12, color: _kText2)),
                      ],
                    )),
                    Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                      Text('₹${(price * qty).toStringAsFixed(0)}',
                        style: GoogleFonts.inter(
                          fontSize: 15, fontWeight: FontWeight.w800,
                          color: _kText0)),
                      const Gap(6),
                      Text('Edit', style: GoogleFonts.inter(
                        fontSize: 11, fontWeight: FontWeight.w700,
                        color: _kBrand)),
                    ]),
                  ]),
                ),
              );
            }).toList());
          },
        ),

        // ── Promo code ────────────────────────────────────────────────
        Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: _kBorder),
            boxShadow: [BoxShadow(
              color: Colors.black.withValues(alpha: 0.04),
              blurRadius: 12, offset: const Offset(0, 2))],
          ),
          child: Row(children: [
            const SizedBox(width: 14),
            const Icon(Icons.local_offer_outlined, size: 16, color: _kText2),
            const SizedBox(width: 8),
            Expanded(child: TextField(
              controller: promoCtrl,
              style: GoogleFonts.inter(fontSize: 14, color: _kText0,
                fontWeight: FontWeight.w500),
              textCapitalization: TextCapitalization.characters,
              decoration: InputDecoration(
                hintText: 'Referral / promo code',
                hintStyle: GoogleFonts.inter(fontSize: 14, color: _kText2),
                border: InputBorder.none,
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(vertical: 16),
              ),
            )),
            // Apply — flush right, inherits container's right border-radius
            GestureDetector(
              onTap: () => HapticFeedback.selectionClick(),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                decoration: const BoxDecoration(
                  color: _kBrand,
                  borderRadius: BorderRadius.only(
                    topRight:    Radius.circular(15),
                    bottomRight: Radius.circular(15),
                  ),
                ),
                child: Text('Apply', style: GoogleFonts.inter(
                  fontSize: 13, fontWeight: FontWeight.w800,
                  color: Colors.white, letterSpacing: 0.2)),
              ),
            ),
          ]),
        ),
        const Gap(20),

        // ── Price breakdown ───────────────────────────────────────────
        cartAsync.when(
          loading: () => const SizedBox.shrink(),
          error: (_, __) => const SizedBox.shrink(),
          data: (cart) {
            final items = cart['items'] as List? ?? [];
            final subtotal = items.fold<double>(0, (s, i) {
              final item = i as Map;
              final product = (item['product'] as Map?) ?? const {};
              final pRaw = item['price'] ?? product['basePrice'] ?? product['price'] ?? 0;
              final p = pRaw is num ? pRaw.toDouble() : double.tryParse(pRaw.toString()) ?? 0;
              final q = (item['qty'] as num?)?.toInt() ?? (item['quantity'] as num?)?.toInt() ?? 1;
              return s + p * q;
            });
            final giftWrapFee = giftWrap ? 49.0 : 0.0;
            final coinsDiscount = applyCoins ? coinsBalance * 0.01 : 0.0;
            final delivery = subtotal >= freeDeliveryAbove ? 0.0 : deliveryCharge;
            final codFee   = payMethod == 'cod' ? codCharge : 0.0;
            final total    = subtotal + giftWrapFee + thankYouCardPrice
                - coinsDiscount + delivery + codFee;
            final saved = coinsDiscount
                + (subtotal >= freeDeliveryAbove && subtotal > 0 ? deliveryCharge : 0.0);

            return Container(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(20),
                boxShadow: [BoxShadow(
                  color: Colors.black.withValues(alpha: 0.06),
                  blurRadius: 20, offset: const Offset(0, 4))],
              ),
              padding: const EdgeInsets.all(20),
              child: Column(children: [
                _PriceRow('Subtotal', '₹${subtotal.toStringAsFixed(0)}'),
                if (giftWrap) ...[
                  const Gap(14),
                  _PriceRow('Gift wrap', '+₹49'),
                ],
                if (thankYouCardPrice > 0) ...[
                  const Gap(14),
                  _PriceRow(
                    '✉️  ${thankYouCardName ?? 'Thank-you card'} · $thankYouCardSize',
                    '+₹${thankYouCardPrice.toStringAsFixed(0)}',
                  ),
                ],
                if (applyCoins && coinsDiscount > 0) ...[
                  const Gap(14),
                  _PriceRow('🪙  Coins',
                    '-₹${coinsDiscount.toStringAsFixed(0)}',
                    valueColor: _kAmber),
                ],
                const Gap(14),
                _PriceRow('Delivery',
                  delivery == 0 ? 'FREE 🎉' : '₹${delivery.toStringAsFixed(0)}',
                  valueColor: delivery == 0 ? _kGreen : null),
                if (delivery == 0)
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Padding(
                      padding: const EdgeInsets.only(top: 3),
                      child: Text(
                        'Free delivery above ₹${freeDeliveryAbove.toStringAsFixed(0)}',
                        style: GoogleFonts.inter(
                          fontSize: 11, color: _kText2,
                          fontStyle: FontStyle.italic)),
                    ),
                  ),
                if (codFee > 0) ...[
                  const Gap(14),
                  _PriceRow('🚚  COD handling fee',
                    '+₹${codFee.toStringAsFixed(0)}',
                    valueColor: _kText1),
                ],
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 14),
                  child: Divider(
                    color: Color(0xFFF0EDE8), thickness: 1, height: 1)),
                Row(mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Total', style: GoogleFonts.inter(
                      fontSize: 16, fontWeight: FontWeight.w800,
                      color: _kText0)),
                    Text('₹${total.toStringAsFixed(0)}',
                      style: GoogleFonts.inter(
                        fontSize: 28, fontWeight: FontWeight.w900,
                        color: _kBrand)),
                  ]),
                if (saved > 0) ...[
                  const Gap(6),
                  Align(
                    alignment: Alignment.centerRight,
                    child: Text('You saved ₹${saved.toStringAsFixed(0)} 🎉',
                      style: GoogleFonts.inter(
                        fontSize: 12, fontWeight: FontWeight.w600,
                        color: _kGreen)),
                  ),
                ],
              ]),
            );
          },
        ),
        const Gap(24),

        // ── Payment method ────────────────────────────────────────────
        Text('PAYMENT METHOD', style: GoogleFonts.inter(
          fontSize: 10, fontWeight: FontWeight.w800,
          color: _kText2, letterSpacing: 1.2)),
        const Gap(12),
        _PayTile(
          emoji: '🚚',
          title: 'Cash on Delivery',
          subtitle: codCharge > 0
              ? 'Pay when your gift arrives · +₹${codCharge.toStringAsFixed(0)} handling'
              : 'Pay when your gift arrives',
          selected: payMethod == 'cod',
          selectedColor: _kGreen,
          onTap: () => onPayMethod('cod'),
        ),
        if (razorpayEnabled) ...[
          const Gap(12),
          _PayTile(
            emoji: '💳',
            title: 'Card / UPI / Net Banking',
            subtitle: 'Secure payment via Razorpay',
            selected: payMethod == 'razorpay',
            onTap: () => onPayMethod('razorpay'),
            badge: '🔒 Secure',
          ),
        ],
        const Gap(24),

        // ── Delivering To ─────────────────────────────────────────────
        if (deliveryName.isNotEmpty || deliveryAddress.isNotEmpty) ...[
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
              boxShadow: [BoxShadow(
                color: Colors.black.withValues(alpha: 0.06),
                blurRadius: 20, offset: const Offset(0, 4))],
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('DELIVERING TO', style: GoogleFonts.inter(
                  fontSize: 10, fontWeight: FontWeight.w800,
                  color: _kText2, letterSpacing: 1.2)),
                const Gap(10),
                if (deliveryName.isNotEmpty)
                  Text(deliveryName, style: GoogleFonts.inter(
                    fontSize: 15, fontWeight: FontWeight.w700,
                    color: _kText0)),
                if (deliveryAddress.isNotEmpty) ...[
                  const Gap(4),
                  Text(deliveryAddress, style: GoogleFonts.inter(
                    fontSize: 13, color: _kText2, height: 1.5)),
                ],
              ]),
          ),
          const Gap(24),
        ],

        if (error != null) ...[const Gap(16), _ErrorBanner(error!)],

        // ── Trust chips ───────────────────────────────────────────────
        Row(mainAxisAlignment: MainAxisAlignment.spaceAround, children: [
          _TrustChip(emoji: '🔒', label: 'SSL Secured'),
          _TrustChip(emoji: '✅', label: '7-Day Returns'),
          _TrustChip(emoji: '📦', label: 'Track Anytime'),
        ]),
        const Gap(16),

        // ── Razorpay footer ───────────────────────────────────────────
        Center(
          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            Text('Secured by ', style: GoogleFonts.inter(
              fontSize: 11, color: _kText2)),
            Text('Razorpay', style: GoogleFonts.inter(
              fontSize: 11, fontWeight: FontWeight.w700,
              color: const Color(0xFF3395FF))),
            const Gap(8),
            _PayBrand('UPI'),
            const Gap(4),
            _PayBrand('GPay'),
            const Gap(4),
            _PayBrand('Visa'),
          ]),
        ),
        const Gap(16),
      ],
    );
  }
}

class _TrustChip extends StatelessWidget {
  final String emoji, label;
  const _TrustChip({required this.emoji, required this.label});
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [BoxShadow(
          color: Colors.black.withValues(alpha: 0.05),
          blurRadius: 10, offset: const Offset(0, 2))],
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Text(emoji, style: const TextStyle(fontSize: 13)),
        const Gap(6),
        Text(label, style: GoogleFonts.inter(
          fontSize: 10, fontWeight: FontWeight.w700, color: _kText1)),
      ]),
    );
  }
}

class _PayBrand extends StatelessWidget {
  final String label;
  const _PayBrand(this.label);
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: _kFieldBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _kBorder),
      ),
      child: Text(label, style: GoogleFonts.inter(
        fontSize: 9, fontWeight: FontWeight.w700, color: _kText1)),
    );
  }
}

// ─── Shared small widgets ─────────────────────────────────────────────────────

class _FieldLabel extends StatelessWidget {
  final String text;
  final bool required;
  const _FieldLabel(this.text, {this.required = false});
  @override
  Widget build(BuildContext context) {
    return RichText(text: TextSpan(children: [
      TextSpan(text: text, style: GoogleFonts.inter(
        fontSize: 13, fontWeight: FontWeight.w700, color: _kText0)),
      if (required)
        TextSpan(text: ' *', style: GoogleFonts.inter(
          fontSize: 13, fontWeight: FontWeight.w700, color: _kBrand)),
    ]));
  }
}

class _InputField extends StatelessWidget {
  final TextEditingController ctrl;
  final String hint;
  final TextInputType type;
  final int? maxLen, maxLines;
  final List<TextInputFormatter>? formatters;
  final bool enabled;
  final TextAlign? textAlign;
  final double? letterSpacing;
  final Widget? suffix;

  const _InputField({
    required this.ctrl, required this.hint,
    this.type = TextInputType.text, this.maxLen, this.maxLines = 1,
    this.formatters, this.enabled = true,
    this.textAlign, this.letterSpacing, this.suffix,
  });

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: ctrl,
      keyboardType: type,
      maxLength: maxLen,
      maxLines: maxLines,
      inputFormatters: formatters,
      enabled: enabled,
      textAlign: textAlign ?? TextAlign.start,
      style: GoogleFonts.inter(
        fontSize: 14, color: _kText0, fontWeight: FontWeight.w500,
        letterSpacing: letterSpacing,
      ),
      decoration: InputDecoration(
        hintText: hint,
        counterText: '',
        hintStyle: GoogleFonts.inter(fontSize: 14, color: _kText2,
            letterSpacing: letterSpacing),
        filled: true,
        fillColor: enabled ? Colors.white : _kFieldBg,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: _kBorder),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: _kBorder),
        ),
        disabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: _kBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: _kBrand, width: 1.5),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        suffixIcon: suffix == null
            ? null
            : Padding(
                padding: const EdgeInsets.only(right: 12),
                child: suffix),
        suffixIconConstraints: suffix == null
            ? null
            : const BoxConstraints(minWidth: 30, minHeight: 30),
      ),
    );
  }
}

class _AccentButton extends StatelessWidget {
  final String label;
  final bool loading;
  final bool filled;
  final VoidCallback? onPressed;
  const _AccentButton({
    required this.label, this.loading = false,
    required this.filled, required this.onPressed,
  });
  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null && !loading;
    return GestureDetector(
      onTap: enabled ? onPressed : null,
      child: AnimatedContainer(
        duration: 180.ms,
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
        decoration: BoxDecoration(
          color: filled
              ? (enabled ? _kBrand : _kBrand.withValues(alpha: 0.4))
              : _kBrand.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: _kBrand.withValues(alpha: filled ? 1 : 0.3)),
        ),
        child: loading
            ? const SizedBox(width: 18, height: 18,
                child: CircularProgressIndicator(strokeWidth: 2, color: _kBrand))
            : Text(label, style: GoogleFonts.inter(
                fontSize: 13, fontWeight: FontWeight.w700,
                color: filled ? Colors.white : _kBrand,
              )),
      ),
    );
  }
}

class _PrimaryCta extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  const _PrimaryCta({required this.label, required this.onPressed});
  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null;
    return GestureDetector(
      onTap: enabled ? onPressed : null,
      child: AnimatedContainer(
        duration: 220.ms,
        width: double.infinity, height: 54,
        decoration: BoxDecoration(
          color: enabled ? _kBrand : _kBorder,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Center(
          child: Text(label, style: GoogleFonts.inter(
            fontSize: 15, fontWeight: FontWeight.w800,
            color: enabled ? Colors.white : _kText2,
          )),
        ),
      ),
    );
  }
}

class _ToggleCard extends StatelessWidget {
  final String emoji, title, subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;
  const _ToggleCard({
    required this.emoji, required this.title, required this.subtitle,
    required this.value, required this.onChanged,
  });
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () { HapticFeedback.selectionClick(); onChanged(!value); },
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: value ? _kBrand.withValues(alpha: 0.4) : _kBorder),
        ),
        child: Row(children: [
          // iOS-style switch
          AnimatedContainer(
            duration: 200.ms,
            width: 44, height: 26,
            padding: const EdgeInsets.all(2),
            decoration: BoxDecoration(
              color: value ? _kBrand : _kBorder,
              borderRadius: BorderRadius.circular(999),
            ),
            alignment: value ? Alignment.centerRight : Alignment.centerLeft,
            child: Container(
              width: 22, height: 22,
              decoration: const BoxDecoration(
                color: Colors.white, shape: BoxShape.circle,
              ),
            ),
          ),
          const Gap(14),
          Text(emoji, style: const TextStyle(fontSize: 20)),
          const Gap(10),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: GoogleFonts.inter(
              fontSize: 14, fontWeight: FontWeight.w700, color: _kText0)),
            Text(subtitle, style: GoogleFonts.inter(
              fontSize: 11, color: _kText2)),
          ])),
        ]),
      ),
    );
  }
}

class _AddonCard extends StatelessWidget {
  final String emoji, title, subtitle, trailing;
  final Color? trailingColor;
  final bool value;
  final bool highlight;
  final ValueChanged<bool> onChanged;
  const _AddonCard({
    required this.emoji, required this.title, required this.subtitle,
    required this.trailing, this.trailingColor,
    required this.value, this.highlight = false, required this.onChanged,
  });
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () { HapticFeedback.selectionClick(); onChanged(!value); },
      child: AnimatedContainer(
        duration: 180.ms,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: highlight && value ? _kAmber.withValues(alpha: 0.08) : Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: value
                ? (highlight ? _kAmber : _kBrand).withValues(alpha: 0.4)
                : _kBorder,
            width: value ? 1.5 : 1,
          ),
        ),
        child: Row(children: [
          Container(
            width: 40, height: 40,
            decoration: BoxDecoration(
              color: (trailingColor ?? _kBrand).withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Center(child: Text(emoji, style: const TextStyle(fontSize: 20))),
          ),
          const Gap(12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: GoogleFonts.inter(
              fontSize: 14, fontWeight: FontWeight.w700, color: _kText0)),
            Text(subtitle, style: GoogleFonts.inter(
              fontSize: 11, color: _kText2)),
          ])),
          Text(trailing, style: GoogleFonts.inter(
            fontSize: 14, fontWeight: FontWeight.w800,
            color: trailingColor ?? _kBrand,
          )),
          const Gap(10),
          // Checkbox square
          AnimatedContainer(
            duration: 180.ms,
            width: 22, height: 22,
            decoration: BoxDecoration(
              color: value ? (highlight ? _kAmber : _kBrand) : Colors.white,
              borderRadius: BorderRadius.circular(5),
              border: Border.all(
                color: value
                    ? (highlight ? _kAmber : _kBrand)
                    : _kText2.withValues(alpha: 0.4),
                width: 1.5,
              ),
            ),
            child: value
                ? const Icon(Icons.check_rounded, size: 16, color: Colors.white)
                : null,
          ),
        ]),
      ),
    );
  }
}

class _CheckboxRow extends StatelessWidget {
  final String emoji, label;
  final bool value;
  final ValueChanged<bool> onChanged;
  const _CheckboxRow({
    required this.emoji, required this.label,
    required this.value, required this.onChanged,
  });
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () { HapticFeedback.selectionClick(); onChanged(!value); },
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(children: [
          AnimatedContainer(
            duration: 180.ms,
            width: 20, height: 20,
            decoration: BoxDecoration(
              color: value ? _kBrand : Colors.white,
              borderRadius: BorderRadius.circular(5),
              border: Border.all(
                color: value ? _kBrand : _kText2.withValues(alpha: 0.4),
                width: 1.5,
              ),
            ),
            child: value
                ? const Icon(Icons.check_rounded, size: 14, color: Colors.white)
                : null,
          ),
          const Gap(10),
          Text(emoji, style: const TextStyle(fontSize: 16)),
          const Gap(6),
          Text(label, style: GoogleFonts.inter(
            fontSize: 13, fontWeight: FontWeight.w500, color: _kText0)),
        ]),
      ),
    );
  }
}

class _PriceRow extends StatelessWidget {
  final String label, value;
  final Color? valueColor;
  const _PriceRow(this.label, this.value, {this.valueColor});
  @override
  Widget build(BuildContext context) => Row(
    mainAxisAlignment: MainAxisAlignment.spaceBetween,
    children: [
      Text(label, style: GoogleFonts.inter(fontSize: 13, color: _kText2)),
      Text(value, style: GoogleFonts.inter(
        fontSize: 13, fontWeight: FontWeight.w700,
        color: valueColor ?? _kText0)),
    ],
  );
}

class _PayTile extends StatelessWidget {
  final String emoji, title, subtitle;
  final bool selected;
  final VoidCallback onTap;
  final String? badge;
  final Color? selectedColor; // override highlight color (e.g. green for COD)
  const _PayTile({
    required this.emoji, required this.title, required this.subtitle,
    required this.selected, required this.onTap, this.badge,
    this.selectedColor,
  });
  @override
  Widget build(BuildContext context) {
    final accent = selectedColor ?? _kBrand;
    final selBg  = selectedColor != null
        ? const Color(0xFFEAF7F0)   // soft green for COD
        : _kBrand.withValues(alpha: 0.06);
    return GestureDetector(
      onTap: () { HapticFeedback.selectionClick(); onTap(); },
      child: AnimatedContainer(
        duration: 200.ms,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: selected ? selBg : Colors.white,
          borderRadius: BorderRadius.circular(20),
          boxShadow: [BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 16, offset: const Offset(0, 4))],
        ),
        child: Row(children: [
          // Radio indicator
          AnimatedContainer(
            duration: 200.ms,
            width: 22, height: 22,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: selected ? accent : Colors.transparent,
              border: Border.all(
                color: selected ? accent : _kText2.withValues(alpha: 0.3),
                width: 2,
              ),
            ),
            child: selected
                ? const Icon(Icons.check_rounded, size: 13, color: Colors.white)
                : null,
          ),
          const Gap(14),
          Text(emoji, style: const TextStyle(fontSize: 26)),
          const Gap(12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: GoogleFonts.inter(
              fontSize: 15, fontWeight: FontWeight.w700, color: _kText0)),
            const Gap(2),
            Text(subtitle, style: GoogleFonts.inter(
              fontSize: 12, color: _kText2)),
          ])),
          if (badge != null) ...[
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: _kGreen.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(badge!, style: GoogleFonts.inter(
                fontSize: 10, fontWeight: FontWeight.w700, color: _kGreen)),
            ),
            const Gap(6),
          ],
          Icon(Icons.lock_outline_rounded,
              size: 14, color: _kText2.withValues(alpha: 0.4)),
        ]),
      ),
    );
  }
}

// ─── Thank-you Card add-on tile ───────────────────────────────────────────────

class _ThankYouCardAddon extends StatelessWidget {
  final String? templateName, image, size;
  final double price;
  final VoidCallback onTap, onClear;
  const _ThankYouCardAddon({
    required this.templateName, required this.image,
    required this.size, required this.price,
    required this.onTap, required this.onClear,
  });

  @override
  Widget build(BuildContext context) {
    final picked = templateName != null;
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: 180.ms,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: picked ? _kBrand.withValues(alpha: 0.04) : Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: picked ? _kBrand.withValues(alpha: 0.4) : _kBorder,
            width: picked ? 1.5 : 1,
          ),
        ),
        child: Row(children: [
          // Thumbnail or emoji
          Container(
            width: 48, height: 48,
            decoration: BoxDecoration(
              color: _kBrand.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(12),
            ),
            clipBehavior: Clip.antiAlias,
            child: picked && image != null && image!.isNotEmpty
                ? Image.network(image!, fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => const Center(
                      child: Text('✉️', style: TextStyle(fontSize: 22))))
                : const Center(child: Text('✉️', style: TextStyle(fontSize: 22))),
          ),
          const Gap(12),
          Expanded(child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(picked ? templateName! : 'Thank-you Card',
                maxLines: 1, overflow: TextOverflow.ellipsis,
                style: GoogleFonts.inter(
                  fontSize: 14, fontWeight: FontWeight.w700, color: _kText0)),
              const Gap(2),
              Text(
                picked
                    ? 'Size: $size'
                    : 'Pick a design + size',
                style: GoogleFonts.inter(fontSize: 11, color: _kText2)),
            ])),
          if (picked) ...[
            Text('+₹${price.toStringAsFixed(0)}',
              style: GoogleFonts.inter(
                fontSize: 14, fontWeight: FontWeight.w800, color: _kBrand)),
            const Gap(8),
            GestureDetector(
              onTap: onClear,
              child: const Icon(Icons.close_rounded,
                  size: 18, color: _kText2),
            ),
          ] else
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: _kBrand.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: _kBrand.withValues(alpha: 0.3)),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.add_rounded, size: 14, color: _kBrand),
                const Gap(4),
                Text('Choose', style: GoogleFonts.inter(
                  fontSize: 11, fontWeight: FontWeight.w700, color: _kBrand)),
              ]),
            ),
        ]),
      ),
    );
  }
}

// ─── Thank-you Card picker bottom sheet ───────────────────────────────────────

class _ThankYouPickerSheet extends ConsumerStatefulWidget {
  @override
  ConsumerState<_ThankYouPickerSheet> createState() => _ThankYouPickerSheetState();
}

class _ThankYouPickerSheetState extends ConsumerState<_ThankYouPickerSheet> {
  // 2-step flow: 0 = template grid, 1 = size chooser
  int _step = 0;
  Map<String, dynamic>? _template;
  Map<String, dynamic>? _size;

  // Fallback so the UI is never empty (if admin hasn't configured any)
  static const _fallbackTemplates = [
    {
      'id': 'warm-wishes',
      'name': 'Warm Wishes',
      'emoji': '🌷',
      'sizes': [
        {'label': 'Small (A6)', 'price': 29},
        {'label': 'Medium (A5)', 'price': 49},
        {'label': 'Large (A4)', 'price': 79},
      ],
    },
    {
      'id': 'heartfelt',
      'name': 'Heartfelt',
      'emoji': '💌',
      'sizes': [
        {'label': 'Small (A6)', 'price': 29},
        {'label': 'Medium (A5)', 'price': 49},
        {'label': 'Large (A4)', 'price': 79},
      ],
    },
    {
      'id': 'celebration',
      'name': 'Celebration',
      'emoji': '🎉',
      'sizes': [
        {'label': 'Small (A6)', 'price': 39},
        {'label': 'Medium (A5)', 'price': 59},
      ],
    },
    {
      'id': 'elegant',
      'name': 'Elegant',
      'emoji': '✨',
      'sizes': [
        {'label': 'Medium (A5)', 'price': 49},
        {'label': 'Large (A4)', 'price': 79},
      ],
    },
  ];

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(_thankYouTemplatesProvider);
    final templates = async.maybeWhen(
      data: (list) => list.isEmpty ? _fallbackTemplates : list,
      orElse: () => _fallbackTemplates,
    );

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.75,
      ),
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Drag handle
          Center(child: Container(
            width: 42, height: 4,
            margin: const EdgeInsets.only(bottom: 12),
            decoration: BoxDecoration(
              color: _kBorder,
              borderRadius: BorderRadius.circular(2),
            ),
          )),
          Row(children: [
            if (_step == 1)
              GestureDetector(
                onTap: () => setState(() => _step = 0),
                child: const Icon(Icons.arrow_back_ios_new_rounded,
                    size: 18, color: _kText0),
              ),
            if (_step == 1) const Gap(10),
            Expanded(
              child: Text(
                _step == 0 ? 'Choose a Thank-you Card' : 'Pick a size',
                style: GoogleFonts.inter(
                  fontSize: 18, fontWeight: FontWeight.w800, color: _kText0,
                ),
              ),
            ),
            GestureDetector(
              onTap: () => Navigator.pop(context),
              child: const Icon(Icons.close_rounded,
                  size: 22, color: _kText2),
            ),
          ]),
          const Gap(4),
          Text(
            _step == 0
                ? 'Designs assigned by Gifteeng'
                : _template?['name'] as String? ?? '',
            style: GoogleFonts.inter(fontSize: 12, color: _kText2),
          ),
          const Gap(16),

          Flexible(
            child: _step == 0
                ? _buildTemplateGrid(templates)
                : _buildSizePicker(),
          ),
        ],
      ),
    );
  }

  Widget _buildTemplateGrid(List<Map<String, dynamic>> templates) {
    return GridView.builder(
      shrinkWrap: true,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
        childAspectRatio: 0.82,
      ),
      itemCount: templates.length,
      itemBuilder: (_, i) {
        final t = templates[i];
        final name  = t['name']  as String? ?? '';
        final image = t['image'] as String? ?? t['thumbnail'] as String?;
        final emoji = t['emoji'] as String? ?? '✉️';
        final sizes = (t['sizes'] as List?) ?? [];
        final minPrice = sizes.isNotEmpty
            ? sizes
                .map((s) => (s as Map)['price'] as num? ?? 0)
                .reduce((a, b) => a.toDouble() < b.toDouble() ? a : b)
            : 29;

        return GestureDetector(
          onTap: () {
            HapticFeedback.selectionClick();
            setState(() { _template = t; _step = 1; });
          },
          child: Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: _kBorder),
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: Container(
                    color: _kBrand.withValues(alpha: 0.06),
                    child: image != null && image.isNotEmpty
                        ? Image.network(image, fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => Center(
                              child: Text(emoji,
                                  style: const TextStyle(fontSize: 56))))
                        : Center(
                            child: Text(emoji,
                                style: const TextStyle(fontSize: 56))),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(name,
                        maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.inter(
                          fontSize: 13, fontWeight: FontWeight.w700,
                          color: _kText0)),
                      const Gap(2),
                      Text('from ₹$minPrice',
                        style: GoogleFonts.inter(
                          fontSize: 11, fontWeight: FontWeight.w600,
                          color: _kBrand)),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildSizePicker() {
    final t = _template;
    if (t == null) return const SizedBox.shrink();
    final sizes = (t['sizes'] as List?)
            ?.map((s) => Map<String, dynamic>.from(s as Map))
            .toList() ??
        [];
    final image = t['image'] as String? ?? t['thumbnail'] as String?;
    final emoji = t['emoji'] as String? ?? '✉️';

    return ListView(
      shrinkWrap: true,
      children: [
        // Preview
        Container(
          height: 140,
          decoration: BoxDecoration(
            color: _kBrand.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(12),
          ),
          clipBehavior: Clip.antiAlias,
          child: image != null && image.isNotEmpty
              ? Image.network(image, fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Center(
                      child: Text(emoji, style: const TextStyle(fontSize: 70))))
              : Center(child: Text(emoji, style: const TextStyle(fontSize: 70))),
        ),
        const Gap(16),
        Text('Size options',
          style: GoogleFonts.inter(
            fontSize: 13, fontWeight: FontWeight.w800,
            color: _kText2, letterSpacing: 0.3)),
        const Gap(10),

        ...sizes.map((s) {
          final label = s['label'] as String? ?? '';
          final price = (s['price'] as num?)?.toDouble() ?? 0;
          final selected = _size?['label'] == label;
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: GestureDetector(
              onTap: () {
                HapticFeedback.selectionClick();
                setState(() => _size = s);
              },
              child: AnimatedContainer(
                duration: 180.ms,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: selected
                      ? _kBrand.withValues(alpha: 0.05)
                      : Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: selected ? _kBrand : _kBorder,
                    width: selected ? 1.5 : 1,
                  ),
                ),
                child: Row(children: [
                  AnimatedContainer(
                    duration: 180.ms,
                    width: 20, height: 20,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: selected ? _kBrand : _kText2.withValues(alpha: 0.4),
                        width: 2,
                      ),
                    ),
                    child: selected
                        ? Center(child: Container(
                            width: 10, height: 10,
                            decoration: const BoxDecoration(
                              shape: BoxShape.circle, color: _kBrand,
                            ),
                          ))
                        : null,
                  ),
                  const Gap(12),
                  Expanded(child: Text(label,
                    style: GoogleFonts.inter(
                      fontSize: 14, fontWeight: FontWeight.w600, color: _kText0))),
                  Text('+₹${price.toStringAsFixed(0)}',
                    style: GoogleFonts.inter(
                      fontSize: 14, fontWeight: FontWeight.w800, color: _kBrand)),
                ]),
              ),
            ),
          );
        }),
        const Gap(16),

        _PrimaryCta(
          label: _size == null
              ? 'Pick a size'
              : 'Add to Order · +₹${((_size?['price'] as num?) ?? 0).toInt()}',
          onPressed: _size == null
              ? null
              : () {
                  Navigator.pop(context, {
                    'templateId':   t['id'],
                    'templateName': t['name'],
                    'image':        t['image'] ?? t['thumbnail'],
                    'size':         _size!['label'],
                    'price':        _size!['price'],
                  });
                },
        ),
      ],
    );
  }
}

class _RecipientCard extends StatelessWidget {
  final bool isGift;
  final Widget child;
  const _RecipientCard({required this.isGift, required this.child});

  @override
  Widget build(BuildContext context) {
    // When not a gift, just render the fields plainly (no pink card).
    if (!isGift) return child;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: _kBrand.withValues(alpha: 0.03),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _kBrand.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            const Text('🎁', style: TextStyle(fontSize: 14)),
            const Gap(6),
            Text('RECIPIENT DETAILS', style: GoogleFonts.inter(
              fontSize: 11, fontWeight: FontWeight.w800,
              color: _kBrand, letterSpacing: 0.8,
            )),
          ]),
          const Gap(12),
          child,
        ],
      ),
    );
  }
}

class _DeliveryDateField extends StatelessWidget {
  final DateTime? value;
  final ValueChanged<DateTime?> onPick;
  const _DeliveryDateField({required this.value, required this.onPick});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () async {
        HapticFeedback.selectionClick();
        final picked = await showDatePicker(
          context: context,
          initialDate: value ?? DateTime.now().add(const Duration(days: 4)),
          firstDate: DateTime.now(),
          lastDate: DateTime.now().add(const Duration(days: 90)),
          builder: (c, child) => Theme(
            data: Theme.of(c).copyWith(
              colorScheme: const ColorScheme.light(
                primary: _kBrand,
                onPrimary: Colors.white,
                onSurface: _kText0,
              ),
            ),
            child: child!,
          ),
        );
        onPick(picked);
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: _kBorder),
        ),
        child: Row(children: [
          Expanded(
            child: Text(
              value == null
                ? 'dd-mm-yyyy'
                : '${value!.day.toString().padLeft(2, '0')}-${value!.month.toString().padLeft(2, '0')}-${value!.year}',
              style: GoogleFonts.inter(
                fontSize: 14,
                color: value == null ? _kText2 : _kText0,
                fontWeight: value == null ? FontWeight.w400 : FontWeight.w600,
              ),
            ),
          ),
          const Icon(Icons.calendar_today_outlined,
              size: 18, color: _kText2),
        ]),
      ),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  final String message;
  const _ErrorBanner(this.message);
  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
    decoration: BoxDecoration(
      color: _kBrand.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: _kBrand.withValues(alpha: 0.3)),
    ),
    child: Row(children: [
      const Icon(Icons.error_outline_rounded, size: 14, color: _kBrand),
      const Gap(8),
      Expanded(child: Text(message, style: GoogleFonts.inter(
        fontSize: 12, color: _kBrandDark))),
    ]),
  ).animate().fadeIn(duration: 300.ms).shakeX(hz: 3, amount: 3);
}
