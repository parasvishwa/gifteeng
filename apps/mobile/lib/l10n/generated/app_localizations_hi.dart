// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Hindi (`hi`).
class AppLocalizationsHi extends AppLocalizations {
  AppLocalizationsHi([String locale = 'hi']) : super(locale);

  @override
  String get appName => 'Gifteeng';

  @override
  String get navHome => 'होम';

  @override
  String get navShop => 'शॉप';

  @override
  String get navPlay => 'खेलें';

  @override
  String get navGiftCasino => 'गिफ्ट कैसीनो';

  @override
  String get navCart => 'कार्ट';

  @override
  String get navAccount => 'खाता';

  @override
  String get homeSearchHint => 'गिफ्ट, अवसर या श्रेणी खोजें…';

  @override
  String get homeSearchCta => 'खोजें';

  @override
  String get homeOccasionTitle => 'अवसर से खरीदारी';

  @override
  String get homeOccasionSubtitle => 'कौन सा मौका है?';

  @override
  String get homeCategoryTitle => 'श्रेणी से खरीदारी';

  @override
  String get homeSeeAll => 'सभी देखें';

  @override
  String get homeTestimonialsTitle => 'ग्राहक क्या कहते हैं';

  @override
  String get cartEmpty => 'आपका कार्ट ख़ाली है';

  @override
  String get cartContinue => 'खरीदारी जारी रखें';

  @override
  String get cartCheckout => 'चेकआउट पर जाएँ';

  @override
  String get orderSuccessTitle => 'ऑर्डर सफल! 🎉';

  @override
  String get orderSuccessSubtitle => 'आपके गिफ्ट रास्ते में हैं 🎁';

  @override
  String get orderContinueShopping => 'और खरीदारी करें';

  @override
  String get orderViewMyOrders => 'मेरे ऑर्डर देखें';

  @override
  String get reviewWriteTitle => 'समीक्षा लिखें';

  @override
  String get reviewSubmit => 'समीक्षा सबमिट करें';

  @override
  String get reviewThanks => '✨ आपकी समीक्षा के लिए धन्यवाद!';

  @override
  String get remindersTitle => 'गिफ्ट रिमाइंडर';

  @override
  String get remindersEmptyTitle => 'अभी कोई रिमाइंडर नहीं';

  @override
  String get remindersEmptySubtitle =>
      'जन्मदिन, सालगिरह और त्योहारों से पहले हम आपको याद दिलाएँगे — ताकि गिफ्ट समय पर पहुँचे।';

  @override
  String get remindersAddFirst => 'पहला रिमाइंडर जोड़ें';

  @override
  String get remindersAddButton => 'रिमाइंडर जोड़ें';

  @override
  String get remindersNewTitle => 'नया रिमाइंडर';

  @override
  String get remindersEditTitle => 'रिमाइंडर संपादित करें';

  @override
  String get remindersFieldOccasion => 'अवसर';

  @override
  String get remindersFieldRecipient => 'प्राप्तकर्ता (वैकल्पिक)';

  @override
  String get remindersFieldDate => 'कार्यक्रम की तारीख';

  @override
  String get remindersRepeatsYearly => 'हर साल दोहराएँ';

  @override
  String get remindersNotifyBefore => 'कार्यक्रम से पहले सूचना';

  @override
  String get remindersDaysUntilToday => 'आज';

  @override
  String get remindersDaysUntilTomorrow => 'कल';

  @override
  String remindersDaysUntilN(int n) {
    String _temp0 = intl.Intl.pluralLogic(
      n,
      locale: localeName,
      other: '$n दिन',
      one: '1 दिन',
    );
    return '$_temp0';
  }

  @override
  String get referralTitle => 'दोस्तों को बुलाएँ';

  @override
  String get referralHeading => '₹200 दें, ₹200 पाएँ';

  @override
  String get referralCopyCode => 'कॉपी करने के लिए टैप करें';

  @override
  String get referralShareWhatsApp => 'WhatsApp';

  @override
  String get referralShareMore => 'अधिक';

  @override
  String get authSignInRequired => 'जारी रखने के लिए साइन इन करें';

  @override
  String get commonCancel => 'रद्द करें';

  @override
  String get commonSave => 'सहेजें';

  @override
  String get commonDelete => 'हटाएँ';

  @override
  String get commonRetry => 'पुनः प्रयास';

  @override
  String get commonBack => 'वापस';

  @override
  String get langEnglish => 'English';

  @override
  String get langHindi => 'हिन्दी';

  @override
  String get langMarathi => 'मराठी';

  @override
  String get settingsLanguageTitle => 'भाषा';

  @override
  String get settingsLanguageSubtitle => 'अपनी पसंद की भाषा चुनें';
}
