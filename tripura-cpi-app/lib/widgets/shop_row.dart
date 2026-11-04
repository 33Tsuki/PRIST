import 'package:flutter/material.dart';

import '../models/models.dart';
import '../theme/app_theme.dart';

extension CollectionStatusStyle on CollectionStatus {
  Color get color {
    switch (this) {
      case CollectionStatus.completed:
        return const Color(0xFF3FA169);
      case CollectionStatus.partial:
        return const Color(0xFFF1C232);
      case CollectionStatus.notStarted:
        return const Color(0xFFD64545);
    }
  }
}

class ShopRow extends StatelessWidget {
  const ShopRow({
    super.key,
    required this.shopName,
    required this.status,
    this.onTap,
    this.showDivider = true,
  });

  final String shopName;
  final CollectionStatus status;
  final VoidCallback? onTap;
  final bool showDivider;

  @override
  Widget build(BuildContext context) {
    final row = Row(
      children: [
        Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(
            color: status.color,
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            shopName,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: AppColors.textPrimary,
            ),
          ),
        ),
        const Icon(
          Icons.chevron_right_rounded,
          color: AppColors.textSecondary,
          size: 20,
        ),
      ],
    );

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
        decoration: BoxDecoration(
          border: showDivider
              ? const Border(
                  bottom: BorderSide(color: Color(0xFFE5E7EB)),
                )
              : null,
        ),
        child: row,
      ),
    );
  }
}
