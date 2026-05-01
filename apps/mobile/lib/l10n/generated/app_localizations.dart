import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_hi.dart';
import 'app_localizations_mr.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'generated/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
      : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations? of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations);
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
    delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('hi'),
    Locale('mr')
  ];

  /// App name (untranslated brand)
  ///
  /// In en, this message translates to:
  /// **'Gifteeng'**
  String get appName;

  /// No description provided for @navHome.
  ///
  /// In en, this message translates to:
  /// **'Home'**
  String get navHome;

  /// No description provided for @navShop.
  ///
  /// In en, this message translates to:
  /// **'Shop'**
  String get navShop;

  /// No description provided for @navPlay.
  ///
  /// In en, this message translates to:
  /// **'Play'**
  String get navPlay;

  /// No description provided for @navGiftCasino.
  ///
  /// In en, this message translates to:
  /// **'Gift Casino'**
  String get navGiftCasino;

  /// No description provided for @navCart.
  ///
  /// In en, this message translates to:
  /// **'Cart'**
  String get navCart;

  /// No description provided for @navAccount.
  ///
  /// In en, this message translates to:
  /// **'Account'**
  String get navAccount;

  /// No description provided for @homeSearchHint.
  ///
  /// In en, this message translates to:
  /// **'Search gifts, occasions, categories…'**
  String get homeSearchHint;

  /// No description provided for @homeSearchCta.
  ///
  /// In en, this message translates to:
  /// **'Search'**
  String get homeSearchCta;

  /// No description provided for @homeOccasionTitle.
  ///
  /// In en, this message translates to:
  /// **'Shop by Occasion'**
  String get homeOccasionTitle;

  /// No description provided for @homeOccasionSubtitle.
  ///
  /// In en, this message translates to:
  /// **'What\'s the moment?'**
  String get homeOccasionSubtitle;

  /// No description provided for @homeCategoryTitle.
  ///
  /// In en, this message translates to:
  /// **'Shop by Category'**
  String get homeCategoryTitle;

  /// No description provided for @homeSeeAll.
  ///
  /// In en, this message translates to:
  /// **'See all'**
  String get homeSeeAll;

  /// No description provided for @homeTestimonialsTitle.
  ///
  /// In en, this message translates to:
  /// **'What Customers Say'**
  String get homeTestimonialsTitle;

  /// No description provided for @cartEmpty.
  ///
  /// In en, this message translates to:
  /// **'Your cart is empty'**
  String get cartEmpty;

  /// No description provided for @cartContinue.
  ///
  /// In en, this message translates to:
  /// **'Continue Shopping'**
  String get cartContinue;

  /// No description provided for @cartCheckout.
  ///
  /// In en, this message translates to:
  /// **'Proceed to Checkout'**
  String get cartCheckout;

  /// No description provided for @orderSuccessTitle.
  ///
  /// In en, this message translates to:
  /// **'Order Placed! 🎉'**
  String get orderSuccessTitle;

  /// No description provided for @orderSuccessSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Your gifts are on their way 🎁'**
  String get orderSuccessSubtitle;

  /// No description provided for @orderContinueShopping.
  ///
  /// In en, this message translates to:
  /// **'Continue Shopping'**
  String get orderContinueShopping;

  /// No description provided for @orderViewMyOrders.
  ///
  /// In en, this message translates to:
  /// **'View My Orders'**
  String get orderViewMyOrders;

  /// No description provided for @reviewWriteTitle.
  ///
  /// In en, this message translates to:
  /// **'Write a review'**
  String get reviewWriteTitle;

  /// No description provided for @reviewSubmit.
  ///
  /// In en, this message translates to:
  /// **'Submit review'**
  String get reviewSubmit;

  /// No description provided for @reviewThanks.
  ///
  /// In en, this message translates to:
  /// **'✨ Thanks for your review!'**
  String get reviewThanks;

  /// No description provided for @remindersTitle.
  ///
  /// In en, this message translates to:
  /// **'Gift Reminders'**
  String get remindersTitle;

  /// No description provided for @remindersEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No reminders yet'**
  String get remindersEmptyTitle;

  /// No description provided for @remindersEmptySubtitle.
  ///
  /// In en, this message translates to:
  /// **'We\'ll nudge you before birthdays, anniversaries, and festivals so your gift always arrives on time.'**
  String get remindersEmptySubtitle;

  /// No description provided for @remindersAddFirst.
  ///
  /// In en, this message translates to:
  /// **'Add your first reminder'**
  String get remindersAddFirst;

  /// No description provided for @remindersAddButton.
  ///
  /// In en, this message translates to:
  /// **'Add reminder'**
  String get remindersAddButton;

  /// No description provided for @remindersNewTitle.
  ///
  /// In en, this message translates to:
  /// **'New reminder'**
  String get remindersNewTitle;

  /// No description provided for @remindersEditTitle.
  ///
  /// In en, this message translates to:
  /// **'Edit reminder'**
  String get remindersEditTitle;

  /// No description provided for @remindersFieldOccasion.
  ///
  /// In en, this message translates to:
  /// **'Occasion'**
  String get remindersFieldOccasion;

  /// No description provided for @remindersFieldRecipient.
  ///
  /// In en, this message translates to:
  /// **'Recipient (optional)'**
  String get remindersFieldRecipient;

  /// No description provided for @remindersFieldDate.
  ///
  /// In en, this message translates to:
  /// **'Event date'**
  String get remindersFieldDate;

  /// No description provided for @remindersRepeatsYearly.
  ///
  /// In en, this message translates to:
  /// **'Repeats yearly'**
  String get remindersRepeatsYearly;

  /// No description provided for @remindersNotifyBefore.
  ///
  /// In en, this message translates to:
  /// **'Notify before event'**
  String get remindersNotifyBefore;

  /// No description provided for @remindersDaysUntilToday.
  ///
  /// In en, this message translates to:
  /// **'Today'**
  String get remindersDaysUntilToday;

  /// No description provided for @remindersDaysUntilTomorrow.
  ///
  /// In en, this message translates to:
  /// **'Tomorrow'**
  String get remindersDaysUntilTomorrow;

  /// No description provided for @remindersDaysUntilN.
  ///
  /// In en, this message translates to:
  /// **'{n, plural, =1{1 day} other{{n} days}}'**
  String remindersDaysUntilN(int n);

  /// No description provided for @referralTitle.
  ///
  /// In en, this message translates to:
  /// **'Refer & Earn'**
  String get referralTitle;

  /// No description provided for @referralHeading.
  ///
  /// In en, this message translates to:
  /// **'Give ₹200, Get ₹200'**
  String get referralHeading;

  /// No description provided for @referralCopyCode.
  ///
  /// In en, this message translates to:
  /// **'Tap to copy'**
  String get referralCopyCode;

  /// No description provided for @referralShareWhatsApp.
  ///
  /// In en, this message translates to:
  /// **'WhatsApp'**
  String get referralShareWhatsApp;

  /// No description provided for @referralShareMore.
  ///
  /// In en, this message translates to:
  /// **'More'**
  String get referralShareMore;

  /// No description provided for @authSignInRequired.
  ///
  /// In en, this message translates to:
  /// **'Please sign in to continue'**
  String get authSignInRequired;

  /// No description provided for @commonCancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get commonCancel;

  /// No description provided for @commonSave.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get commonSave;

  /// No description provided for @commonDelete.
  ///
  /// In en, this message translates to:
  /// **'Delete'**
  String get commonDelete;

  /// No description provided for @commonRetry.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get commonRetry;

  /// No description provided for @commonBack.
  ///
  /// In en, this message translates to:
  /// **'Back'**
  String get commonBack;

  /// No description provided for @langEnglish.
  ///
  /// In en, this message translates to:
  /// **'English'**
  String get langEnglish;

  /// No description provided for @langHindi.
  ///
  /// In en, this message translates to:
  /// **'हिन्दी'**
  String get langHindi;

  /// No description provided for @langMarathi.
  ///
  /// In en, this message translates to:
  /// **'मराठी'**
  String get langMarathi;

  /// No description provided for @settingsLanguageTitle.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get settingsLanguageTitle;

  /// No description provided for @settingsLanguageSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Choose how the app speaks to you'**
  String get settingsLanguageSubtitle;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['en', 'hi', 'mr'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return AppLocalizationsEn();
    case 'hi':
      return AppLocalizationsHi();
    case 'mr':
      return AppLocalizationsMr();
  }

  throw FlutterError(
      'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
      'an issue with the localizations generation tool. Please file an issue '
      'on GitHub with a reproducible sample app and the gen-l10n configuration '
      'that was used.');
}
