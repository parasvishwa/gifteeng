import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Shared shop category filter — home screen writes, shop screen reads.
/// When user taps a category in home, update this provider then navigate to /shop.
final shopCategoryFilterProvider = StateProvider<String>((ref) => 'all');

/// Shared shop occasion filter — tapped from "Shop by Occasion" chip row.
/// Values are short slugs: 'birthday', 'anniversary', 'corporate', 'festival',
/// 'just-because', 'housewarming', or 'all' for no filter.
/// Shop screen reads this, passes to /products?tag=occasion:<slug>.
final shopOccasionFilterProvider = StateProvider<String>((ref) => 'all');
