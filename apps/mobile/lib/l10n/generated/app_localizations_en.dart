// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appName => 'Gifteeng';

  @override
  String get navHome => 'Home';

  @override
  String get navShop => 'Shop';

  @override
  String get navPlay => 'Play';

  @override
  String get navGiftCasino => 'Gift Casino';

  @override
  String get navCart => 'Cart';

  @override
  String get navAccount => 'Account';

  @override
  String get homeSearchHint => 'Search gifts, occasions, categories…';

  @override
  String get homeSearchCta => 'Search';

  @override
  String get homeOccasionTitle => 'Shop by Occasion';

  @override
  String get homeOccasionSubtitle => 'What\'s the moment?';

  @override
  String get homeCategoryTitle => 'Shop by Category';

  @override
  String get homeSeeAll => 'See all';

  @override
  String get homeTestimonialsTitle => 'What Customers Say';

  @override
  String get cartEmpty => 'Your cart is empty';

  @override
  String get cartContinue => 'Continue Shopping';

  @override
  String get cartCheckout => 'Proceed to Checkout';

  @override
  String get orderSuccessTitle => 'Order Placed! 🎉';

  @override
  String get orderSuccessSubtitle => 'Your gifts are on their way 🎁';

  @override
  String get orderContinueShopping => 'Continue Shopping';

  @override
  String get orderViewMyOrders => 'View My Orders';

  @override
  String get reviewWriteTitle => 'Write a review';

  @override
  String get reviewSubmit => 'Submit review';

  @override
  String get reviewThanks => '✨ Thanks for your review!';

  @override
  String get remindersTitle => 'Gift Reminders';

  @override
  String get remindersEmptyTitle => 'No reminders yet';

  @override
  String get remindersEmptySubtitle =>
      'We\'ll nudge you before birthdays, anniversaries, and festivals so your gift always arrives on time.';

  @override
  String get remindersAddFirst => 'Add your first reminder';

  @override
  String get remindersAddButton => 'Add reminder';

  @override
  String get remindersNewTitle => 'New reminder';

  @override
  String get remindersEditTitle => 'Edit reminder';

  @override
  String get remindersFieldOccasion => 'Occasion';

  @override
  String get remindersFieldRecipient => 'Recipient (optional)';

  @override
  String get remindersFieldDate => 'Event date';

  @override
  String get remindersRepeatsYearly => 'Repeats yearly';

  @override
  String get remindersNotifyBefore => 'Notify before event';

  @override
  String get remindersDaysUntilToday => 'Today';

  @override
  String get remindersDaysUntilTomorrow => 'Tomorrow';

  @override
  String remindersDaysUntilN(int n) {
    String _temp0 = intl.Intl.pluralLogic(
      n,
      locale: localeName,
      other: '$n days',
      one: '1 day',
    );
    return '$_temp0';
  }

  @override
  String get referralTitle => 'Refer & Earn';

  @override
  String get referralHeading => 'Give ₹200, Get ₹200';

  @override
  String get referralCopyCode => 'Tap to copy';

  @override
  String get referralShareWhatsApp => 'WhatsApp';

  @override
  String get referralShareMore => 'More';

  @override
  String get authSignInRequired => 'Please sign in to continue';

  @override
  String get commonCancel => 'Cancel';

  @override
  String get commonSave => 'Save';

  @override
  String get commonDelete => 'Delete';

  @override
  String get commonRetry => 'Retry';

  @override
  String get commonBack => 'Back';

  @override
  String get langEnglish => 'English';

  @override
  String get langHindi => 'हिन्दी';

  @override
  String get langMarathi => 'मराठी';

  @override
  String get settingsLanguageTitle => 'Language';

  @override
  String get settingsLanguageSubtitle => 'Choose how the app speaks to you';
}
