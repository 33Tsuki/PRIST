import 'package:flutter/material.dart';

import '../models/models.dart';
import '../theme/app_button_styles.dart';
import '../theme/app_theme.dart';
import 'market_progress_ring.dart';
import 'shop_row.dart';

class MarketCardShop {
  const MarketCardShop({
    required this.name,
    required this.status,
    this.onTap,
  });

  final String name;
  final CollectionStatus status;
  final VoidCallback? onTap;
}

class MarketCard extends StatefulWidget {
  const MarketCard({
    super.key,
    required this.marketName,
    required this.shops,
    required this.collectedShops,
    required this.totalShops,
    required this.readyToSubmit,
    this.description,
    this.reviewRemark,
    this.initiallyExpanded = false,
    this.footerNote,
    this.footerNoteTone,
    this.onSubmit,
    this.submitEnabled = false,
    this.submitting = false,
  });

  final String marketName;
  final String? description;
  final String? reviewRemark;
  final List<MarketCardShop> shops;
  final bool initiallyExpanded;

  /// Shop-level progress, driving the ring and the tag line under the location.
  final int collectedShops;
  final int totalShops;
  final bool readyToSubmit;

  /// Footer line describing what is left to collect. The footer (note + submit
  /// button) is only rendered when [onSubmit] is given.
  final String? footerNote;
  final Color? footerNoteTone;
  final VoidCallback? onSubmit;
  final bool submitEnabled;
  final bool submitting;

  @override
  State<MarketCard> createState() => _MarketCardState();
}

class _MarketCardState extends State<MarketCard> {
  /// Shops shown before the "Show N more" link. Markets can carry 25+ shops,
  /// which buries the card's footer if they all render at once.
  static const int _collapsedShopCount = 5;

  late bool _expanded;

  /// null = show all statuses.
  CollectionStatus? _filter;
  bool _showAllShops = false;

  @override
  void initState() {
    super.initState();
    _expanded = widget.initiallyExpanded;
  }

  void _selectFilter(CollectionStatus? status) {
    setState(() {
      _filter = status;
      // A fresh filter starts collapsed again — otherwise switching from a
      // 26-shop "All" to a 2-shop "Partial" silently keeps the expanded flag.
      _showAllShops = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _buildTile(),
            // Kept outside the ExpansionTile so it stays visible while the card
            // is collapsed.
            if (widget.onSubmit != null) _buildFooter(),
          ],
        ),
      ),
    );
  }

  Widget _buildTile() {
    return ExpansionTile(
      initiallyExpanded: widget.initiallyExpanded,
      onExpansionChanged: (value) {
        setState(() {
          _expanded = value;
        });
      },
      tilePadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      childrenPadding: const EdgeInsets.only(bottom: 4),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
      ),
      collapsedShape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
      ),
      title: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.marketName,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  ),
                ),
                if (widget.description != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    widget.description!,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
                const SizedBox(height: 6),
                Text(
                  widget.readyToSubmit
                      ? 'Ready to submit'
                      : '${widget.collectedShops} of ${widget.totalShops} shops collected',
                  style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w700,
                    color: widget.readyToSubmit
                        ? CollectionStatus.completed.color
                        : AppColors.textSecondary,
                  ),
                ),
                if (widget.reviewRemark != null &&
                    widget.reviewRemark!.trim().isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFFF4E5),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: const Color(0xFFF0C27B)),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(
                          Icons.warning_amber_rounded,
                          size: 16,
                          color: Color(0xFFB26A00),
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            'Returned by supervisor: ${widget.reviewRemark!.trim()}',
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: Color(0xFFB26A00),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          MarketProgressRing(
            collectedShops: widget.collectedShops,
            totalShops: widget.totalShops,
            readyToSubmit: widget.readyToSubmit,
          ),
          const SizedBox(width: 4),
          Icon(
            _expanded
                ? Icons.keyboard_arrow_up_rounded
                : Icons.keyboard_arrow_down_rounded,
            color: AppColors.textSecondary,
          ),
        ],
      ),
      children: _buildShopSection(),
    );
  }

  List<Widget> _buildShopSection() {
    final filtered = _filter == null
        ? widget.shops
        : widget.shops.where((s) => s.status == _filter).toList();
    final limit = _showAllShops ? filtered.length : _collapsedShopCount;
    final visible = filtered.take(limit).toList();
    final hidden = filtered.length - visible.length;

    return [
      _buildFilterBar(),
      if (visible.isEmpty)
        const Padding(
          padding: EdgeInsets.fromLTRB(16, 4, 16, 14),
          child: Text(
            'No shops in this filter',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: AppColors.textMuted,
            ),
          ),
        ),
      ...List.generate(visible.length, (index) {
        final shop = visible[index];
        return ShopRow(
          shopName: shop.name,
          status: shop.status,
          onTap: shop.onTap,
          showDivider: index != visible.length - 1 || hidden > 0,
        );
      }),
      if (hidden > 0)
        InkWell(
          onTap: () => setState(() => _showAllShops = true),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 13),
            child: Text(
              'Show $hidden more',
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: AppColors.primary,
              ),
            ),
          ),
        ),
    ];
  }

  Widget _buildFilterBar() {
    int countOf(CollectionStatus status) =>
        widget.shops.where((s) => s.status == status).length;

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 10),
      child: Row(
        children: [
          _buildFilterPill('All ${widget.shops.length}', null),
          const SizedBox(width: 6),
          _buildFilterPill(
            'Pending ${countOf(CollectionStatus.notStarted)}',
            CollectionStatus.notStarted,
          ),
          const SizedBox(width: 6),
          _buildFilterPill(
            'Partial ${countOf(CollectionStatus.partial)}',
            CollectionStatus.partial,
          ),
          const SizedBox(width: 6),
          _buildFilterPill(
            'Done ${countOf(CollectionStatus.completed)}',
            CollectionStatus.completed,
          ),
        ],
      ),
    );
  }

  Widget _buildFilterPill(String label, CollectionStatus? status) {
    final selected = _filter == status;
    return GestureDetector(
      onTap: () => _selectFilter(status),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: selected ? AppColors.textPrimary : Colors.white,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: selected ? AppColors.textPrimary : const Color(0xFFE5E7EB),
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: selected ? Colors.white : AppColors.textSecondary,
          ),
        ),
      ),
    );
  }

  Widget _buildFooter() {
    final canSubmit = widget.submitEnabled && !widget.submitting;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 12, 12),
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: AppColors.divider)),
      ),
      child: Row(
        children: [
          if (widget.footerNote != null)
            Expanded(
              child: Text(
                widget.footerNote!,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: widget.footerNoteTone ?? AppColors.textSecondary,
                ),
              ),
            )
          else
            const Spacer(),
          const SizedBox(width: 10),
          ElevatedButton.icon(
            onPressed: canSubmit ? widget.onSubmit : null,
            style: AppButtonStyles.submitButton(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            ),
            icon: widget.submitting
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: AppButtonStyles.submitForeground,
                    ),
                  )
                : const Icon(Icons.send_rounded, size: 18),
            label: Text(
              widget.submitting ? 'Submitting...' : 'Submit market',
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }
}
