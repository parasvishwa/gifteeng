import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class ProductCard extends StatelessWidget {
  const ProductCard({super.key, required this.data});

  final Map data;

  @override
  Widget build(BuildContext context) {
    final slug = data['slug']?.toString() ?? '';
    final title = data['title']?.toString() ?? '';
    final price = data['price'];
    final img = data['imageUrl']?.toString();
    return InkWell(
      onTap: slug.isEmpty ? null : () => context.push('/product/$slug'),
      borderRadius: BorderRadius.circular(12),
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: img != null
                  ? Image.network(img, fit: BoxFit.cover)
                  : Container(color: Colors.grey.shade200),
            ),
            Padding(
              padding: const EdgeInsets.all(8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 4),
                  Text('₹${price ?? '-'}'),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
