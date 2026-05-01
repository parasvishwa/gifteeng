// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Marathi (`mr`).
class AppLocalizationsMr extends AppLocalizations {
  AppLocalizationsMr([String locale = 'mr']) : super(locale);

  @override
  String get appName => 'Gifteeng';

  @override
  String get navHome => 'मुख्यपृष्ठ';

  @override
  String get navShop => 'शॉप';

  @override
  String get navPlay => 'खेळा';

  @override
  String get navGiftCasino => 'गिफ्ट कॅसिनो';

  @override
  String get navCart => 'कार्ट';

  @override
  String get navAccount => 'खाते';

  @override
  String get homeSearchHint => 'भेटवस्तू, प्रसंग किंवा प्रकार शोधा…';

  @override
  String get homeSearchCta => 'शोधा';

  @override
  String get homeOccasionTitle => 'प्रसंगानुसार खरेदी';

  @override
  String get homeOccasionSubtitle => 'कोणता क्षण आहे?';

  @override
  String get homeCategoryTitle => 'प्रकारानुसार खरेदी';

  @override
  String get homeSeeAll => 'सर्व पाहा';

  @override
  String get homeTestimonialsTitle => 'ग्राहक काय म्हणतात';

  @override
  String get cartEmpty => 'तुमचे कार्ट रिकामे आहे';

  @override
  String get cartContinue => 'खरेदी सुरू ठेवा';

  @override
  String get cartCheckout => 'चेकआउट करा';

  @override
  String get orderSuccessTitle => 'ऑर्डर यशस्वी! 🎉';

  @override
  String get orderSuccessSubtitle => 'तुमच्या भेटवस्तू मार्गावर आहेत 🎁';

  @override
  String get orderContinueShopping => 'अजून खरेदी करा';

  @override
  String get orderViewMyOrders => 'माझ्या ऑर्डर पाहा';

  @override
  String get reviewWriteTitle => 'पुनरावलोकन लिहा';

  @override
  String get reviewSubmit => 'पुनरावलोकन सादर करा';

  @override
  String get reviewThanks => '✨ तुमच्या पुनरावलोकनाबद्दल धन्यवाद!';

  @override
  String get remindersTitle => 'भेटवस्तू रिमाइंडर';

  @override
  String get remindersEmptyTitle => 'अद्याप रिमाइंडर नाहीत';

  @override
  String get remindersEmptySubtitle =>
      'वाढदिवस, वर्धापनदिन आणि सणांपूर्वी आम्ही तुम्हाला आठवण करून देऊ — त्यामुळे भेटवस्तू वेळेवर पोहोचेल.';

  @override
  String get remindersAddFirst => 'पहिला रिमाइंडर जोडा';

  @override
  String get remindersAddButton => 'रिमाइंडर जोडा';

  @override
  String get remindersNewTitle => 'नवीन रिमाइंडर';

  @override
  String get remindersEditTitle => 'रिमाइंडर संपादित करा';

  @override
  String get remindersFieldOccasion => 'प्रसंग';

  @override
  String get remindersFieldRecipient => 'प्राप्तकर्ता (ऐच्छिक)';

  @override
  String get remindersFieldDate => 'कार्यक्रमाची तारीख';

  @override
  String get remindersRepeatsYearly => 'दरवर्षी पुनरावृत्ती';

  @override
  String get remindersNotifyBefore => 'कार्यक्रमापूर्वी सूचना';

  @override
  String get remindersDaysUntilToday => 'आज';

  @override
  String get remindersDaysUntilTomorrow => 'उद्या';

  @override
  String remindersDaysUntilN(int n) {
    String _temp0 = intl.Intl.pluralLogic(
      n,
      locale: localeName,
      other: '$n दिवस',
      one: '1 दिवस',
    );
    return '$_temp0';
  }

  @override
  String get referralTitle => 'मित्रांना आमंत्रण द्या';

  @override
  String get referralHeading => '₹200 द्या, ₹200 मिळवा';

  @override
  String get referralCopyCode => 'कॉपी करण्यासाठी टॅप करा';

  @override
  String get referralShareWhatsApp => 'WhatsApp';

  @override
  String get referralShareMore => 'अधिक';

  @override
  String get authSignInRequired => 'पुढे चालू ठेवण्यासाठी साइन इन करा';

  @override
  String get commonCancel => 'रद्द करा';

  @override
  String get commonSave => 'जतन करा';

  @override
  String get commonDelete => 'हटवा';

  @override
  String get commonRetry => 'पुन्हा प्रयत्न करा';

  @override
  String get commonBack => 'मागे';

  @override
  String get langEnglish => 'English';

  @override
  String get langHindi => 'हिन्दी';

  @override
  String get langMarathi => 'मराठी';

  @override
  String get settingsLanguageTitle => 'भाषा';

  @override
  String get settingsLanguageSubtitle => 'तुमच्या आवडीची भाषा निवडा';
}
