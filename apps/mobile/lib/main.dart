import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import 'core/theme/app_theme.dart';
import 'core/theme/theme_mode_notifier.dart';
import 'core/router/app_router.dart';
import 'core/monitoring/sentry_setup.dart';
import 'core/analytics/analytics_service.dart';
import 'core/realtime/realtime_sync.dart';
import 'core/notifications/push_service.dart';
import 'core/i18n/locale_notifier.dart';
import 'l10n/generated/app_localizations.dart';

Future<void> main() async {
  // Run the whole app inside a Sentry-captured zone. Every uncaught error —
  // sync, async, microtasks, Flutter framework — will be reported.
  // If SENTRY_DSN is not provided at build time, this becomes a no-op
  // (dev builds don't spam Sentry).
  await runGifteengApp(() async {
    WidgetsFlutterBinding.ensureInitialized();

    // Force dark UI chrome on launch.
    SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      systemNavigationBarColor: GColors.bg0,
      systemNavigationBarIconBrightness: Brightness.light,
    ));

    // Portrait-only for now.
    await SystemChrome.setPreferredOrientations([
      DeviceOrientation.portraitUp,
      DeviceOrientation.portraitDown,
    ]);

    // Pre-cache Inter font weights used in the design system.
    await GoogleFonts.pendingFonts([
      GoogleFonts.inter(fontWeight: FontWeight.w400),
      GoogleFonts.inter(fontWeight: FontWeight.w600),
      GoogleFonts.inter(fontWeight: FontWeight.w700),
      GoogleFonts.inter(fontWeight: FontWeight.w800),
      GoogleFonts.inter(fontWeight: FontWeight.w900),
    ]);

    runApp(const ProviderScope(child: GifteengApp()));
  });
}

class GifteengApp extends ConsumerStatefulWidget {
  const GifteengApp({super.key});

  @override
  ConsumerState<GifteengApp> createState() => _GifteengAppState();
}

class _GifteengAppState extends ConsumerState<GifteengApp> {
  final _scaffoldMessengerKey = GlobalKey<ScaffoldMessengerState>();

  @override
  void initState() {
    super.initState();
    // Kick off the analytics batcher. Safe if called before login — events
    // queued anonymously are attributed by sessionId; once the user logs
    // in we attach customerId via the Dio auth interceptor chain.
    Analytics.instance.start(ref);

    // Push notifications — init gracefully no-ops if Firebase config files
    // aren't present yet. Scaffold messenger key is passed so foreground
    // messages can surface as in-app SnackBars.
    PushService.scaffoldMessengerKey = _scaffoldMessengerKey;
    PushService.instance.init(ref);

    // Realtime sync (#50) — opens an SSE stream to /api/me/events and
    // invalidates Riverpod providers when cart / wishlist / goins / orders
    // change in another session. Auto-reconnects on disconnect; refreshes
    // on app resume as a focus-pull fallback.
    ref.read(realtimeSyncProvider).start();
  }

  @override
  Widget build(BuildContext context) {
    final router    = ref.watch(appRouterProvider);
    final locale    = ref.watch(localeNotifierProvider);
    final themeMode = ref.watch(themeModeNotifierProvider);
    return MaterialApp.router(
      title: 'Gifteeng',
      debugShowCheckedModeBanner: false,
      scaffoldMessengerKey: _scaffoldMessengerKey,
      routerConfig: router,

      // Themes — dark is primary. Light mode is available but many custom
      // widgets still use hardcoded GColors.* (dark). Migrating widgets
      // to GColors.of(context).* is an incremental follow-up.
      theme:     AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: themeMode,

      // Locale (user preference, null → system)
      locale: locale,
      supportedLocales: kSupportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ],
    );
  }
}
