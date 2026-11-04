import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/app_theme.dart';
import '../utils/price_validation.dart';

class ItemCard extends StatefulWidget {
  const ItemCard({
    super.key,
    required this.itemCode,
    required this.itemName,
    required this.description,
    required this.lastMonthPrice,
    required this.monthController,
    required this.isNa,
    required this.onNaChanged,
    required this.isNotApplicable,
    required this.onNotApplicableChanged,
    this.onThisMonthChanged,
    this.lastMonthController,
    this.remarkController,
    this.canMarkNa = true,
    this.canMarkNotApplicable = true,
    this.unitOfSale = '',
    this.dsRemark,
  });

  final String itemCode;
  final String itemName;
  final String description;
  final double? lastMonthPrice;
  final String unitOfSale;

  /// District Supervisor's item-level remark (read-only). When present, an amber
  /// icon in the header opens a tooltip showing this text.
  final String? dsRemark;
  final TextEditingController monthController;
  final TextEditingController? lastMonthController;
  final TextEditingController? remarkController;
  final bool isNa;
  final ValueChanged<bool> onNaChanged;
  final bool isNotApplicable;
  final ValueChanged<bool> onNotApplicableChanged;
  final ValueChanged<String>? onThisMonthChanged;
  final bool canMarkNa;
  final bool canMarkNotApplicable;

  @override
  State<ItemCard> createState() => _ItemCardState();
}

class _ItemCardState extends State<ItemCard> {
  bool _expanded = false;

  // Anchor + controller for the District Supervisor's remark floating tooltip.
  final LayerLink _dsLink = LayerLink();
  final OverlayPortalController _dsController = OverlayPortalController();

  bool get _hasDsRemark =>
      widget.dsRemark != null && widget.dsRemark!.trim().isNotEmpty;

  @override
  void initState() {
    super.initState();
    // Auto-expand when a remark already exists so the surveyor sees it.
    _expanded = widget.remarkController?.text.trim().isNotEmpty ?? false;
    // Recompute the typo hint live as either price field changes.
    widget.monthController.addListener(_onPriceChanged);
    widget.lastMonthController?.addListener(_onPriceChanged);
  }

  @override
  void dispose() {
    // Controllers are owned by the parent screen — only detach our listener.
    widget.monthController.removeListener(_onPriceChanged);
    widget.lastMonthController?.removeListener(_onPriceChanged);
    super.dispose();
  }

  void _onPriceChanged() {
    if (mounted) setState(() {});
  }

  /// Reference "last month" price: the surveyor-entered value when the field is
  /// editable, otherwise the API-provided previous price.
  double? _referencePrev() {
    if (widget.lastMonthController != null) {
      return double.tryParse(widget.lastMonthController!.text.trim());
    }
    return widget.lastMonthPrice;
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 22,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  'Item ${widget.itemCode}: ${widget.itemName}',
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              if (_hasDsRemark) ...[
                _buildDsRemarkButton(),
                const SizedBox(width: 8),
              ],
              _buildRemarkToggle(),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            widget.description,
            style: const TextStyle(
              fontSize: 13,
              color: AppColors.textSecondary,
              fontWeight: FontWeight.w500,
            ),
          ),
          if (widget.unitOfSale.isNotEmpty) ...[
            const SizedBox(height: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: const Color(0xFFEFF6FF),
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: const Color(0xFFBFDBFE)),
              ),
              child: Text(
                'Unit: ${widget.unitOfSale}',
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF1D4ED8),
                ),
              ),
            ),
          ],
          const SizedBox(height: 16),
          _buildPriceArea(),
          _buildRemarkSection(),
        ],
      ),
    );
  }

  Widget _buildPriceArea() {
    // When marked Not Available / Not Applicable the two inputs stay visible but
    // locked (greyed, with a lock icon); the pills remain and the selected one
    // shows a filled highlight. Tapping the selected pill again unmarks the item.
    final bool locked = widget.isNa || widget.isNotApplicable;
    // Keep a selected pill visible even if its can-mark flag is false, so the
    // item can always be unmarked.
    final bool showNa = widget.canMarkNa || widget.isNa;
    final bool showNapl = widget.canMarkNotApplicable || widget.isNotApplicable;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: () {
                final bool isFromPrevMonth = widget.lastMonthPrice != null &&
                    widget.lastMonthController == null;
                final bool isLastMonthLocked = locked || isFromPrevMonth;
                return _LabeledBox(
                  title: 'Last Month',
                  locked: isLastMonthLocked,
                  child: locked
                      ? const _LockedDash()
                      : isFromPrevMonth
                          ? const Text(
                              '***',
                              style: TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                                color: Color(0xFF9CA3AF),
                              ),
                            )
                          : TextField(
                              controller: widget.lastMonthController,
                              obscureText: false,
                              keyboardType:
                                  const TextInputType.numberWithOptions(
                                      decimal: true),
                              inputFormatters: [
                                FilteringTextInputFormatter.allow(
                                    RegExp(r'[\d.]')),
                              ],
                              decoration: const InputDecoration(
                                hintText: 'Tap to enter (Optional)',
                                border: InputBorder.none,
                                enabledBorder: InputBorder.none,
                                focusedBorder: InputBorder.none,
                                filled: false,
                                isDense: true,
                                contentPadding: EdgeInsets.zero,
                              ),
                              style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                                color: AppColors.textPrimary,
                              ),
                            ),
                );
              }(),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _LabeledBox(
                title: 'This Month',
                locked: locked,
                child: locked
                    ? const _LockedDash()
                    : TextField(
                        controller: widget.monthController,
                        keyboardType: const TextInputType.numberWithOptions(
                            decimal: true),
                        inputFormatters: [
                          FilteringTextInputFormatter.allow(RegExp(r'[\d.]')),
                        ],
                        onChanged: widget.onThisMonthChanged,
                        decoration: const InputDecoration(
                          hintText: 'Tap to enter…',
                          border: InputBorder.none,
                          enabledBorder: InputBorder.none,
                          focusedBorder: InputBorder.none,
                          filled: false,
                          isDense: true,
                          contentPadding: EdgeInsets.zero,
                        ),
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: AppColors.textPrimary,
                        ),
                      ),
              ),
            ),
          ],
        ),
        if (!locked &&
            isPriceLikelyTypo(
                double.tryParse(widget.monthController.text.trim()),
                _referencePrev())) ...[
          const SizedBox(height: 10),
          _buildTypoHint(),
        ],
        if (showNa || showNapl) ...[
          const SizedBox(height: 12),
          Row(
            children: [
              if (showNa)
                Expanded(
                  child: _PillToggle(
                    label: 'Not Available',
                    icon: Icons.highlight_off,
                    selected: widget.isNa,
                    idleColor: const Color(0xFFC0605E),
                    idleBg: const Color(0xFFFDEEEE),
                    idleBorder: const Color(0xFFE8A0A0),
                    activeBg: const Color(0xFFD9534F),
                    activeBorder: const Color(0xFFB14A48),
                    activeShadow: const Color(0x59B14A48),
                    onTap: () => widget.onNaChanged(!widget.isNa),
                  ),
                ),
              if (showNa && showNapl) const SizedBox(width: 10),
              if (showNapl)
                Expanded(
                  child: _PillToggle(
                    label: 'Not Applicable',
                    icon: Icons.remove_circle_outline,
                    selected: widget.isNotApplicable,
                    idleColor: const Color(0xFFC09A30),
                    idleBg: const Color(0xFFFEFAE8),
                    idleBorder: const Color(0xFFE8C96A),
                    activeBg: const Color(0xFFE0A82E),
                    activeBorder: const Color(0xFFB18A1E),
                    activeShadow: const Color(0x59B18A1E),
                    onTap: () =>
                        widget.onNotApplicableChanged(!widget.isNotApplicable),
                  ),
                ),
            ],
          ),
        ],
      ],
    );
  }

  Widget _buildTypoHint() {
    final current = double.tryParse(widget.monthController.text.trim());
    final previous = _referencePrev();
    final detail = (previous != null && current != null)
        ? ' (₹*** → ₹${current.toStringAsFixed(2)})'
        : '';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(
        color: const Color(0xFFFEFAE8),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE8C96A)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.warning_amber_rounded,
              size: 18, color: Color(0xFFB18A1E)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Check price — unusual change vs last month$detail',
              style: const TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
                color: Color(0xFF8A6D15),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Amber icon (with a dot badge) that toggles the DS remark tooltip.
  Widget _buildDsRemarkButton() {
    return CompositedTransformTarget(
      link: _dsLink,
      child: OverlayPortal(
        controller: _dsController,
        overlayChildBuilder: _buildDsRemarkOverlay,
        child: GestureDetector(
          onTap: () => _dsController.toggle(),
          behavior: HitTestBehavior.opaque,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: const Color(0xFFFDF4E9),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFFE6C9A8)),
                ),
                child: const Icon(
                  Icons.rate_review_outlined,
                  size: 18,
                  color: Color(0xFFB06F18),
                ),
              ),
              Positioned(
                top: -2,
                right: -2,
                child: Container(
                  width: 12,
                  height: 12,
                  decoration: BoxDecoration(
                    color: const Color(0xFFD98A2B),
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 2),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Floating tooltip anchored under the DS remark icon. A full-screen barrier
  /// dismisses it on an outside tap.
  Widget _buildDsRemarkOverlay(BuildContext context) {
    final remark = widget.dsRemark?.trim() ?? '';
    return Stack(
      children: [
        Positioned.fill(
          child: GestureDetector(
            behavior: HitTestBehavior.translucent,
            onTap: () => _dsController.hide(),
          ),
        ),
        CompositedTransformFollower(
          link: _dsLink,
          showWhenUnlinked: false,
          targetAnchor: Alignment.bottomRight,
          followerAnchor: Alignment.topRight,
          offset: const Offset(0, 8),
          child: Material(
            color: Colors.transparent,
            child: Container(
              width: 280,
              padding: const EdgeInsets.fromLTRB(16, 14, 14, 16),
              decoration: BoxDecoration(
                color: const Color(0xFF2C2113),
                borderRadius: BorderRadius.circular(14),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.28),
                    blurRadius: 30,
                    offset: const Offset(0, 10),
                  ),
                ],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Expanded(
                        child: Text(
                          "DISTRICT SUPERVISOR'S REMARK",
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.5,
                            color: Color(0xFFF0C483),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      GestureDetector(
                        onTap: () => _dsController.hide(),
                        behavior: HitTestBehavior.opaque,
                        child: const Icon(
                          Icons.close_rounded,
                          size: 18,
                          color: Color(0xFFC9BDA9),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    remark,
                    style: const TextStyle(
                      fontSize: 14,
                      height: 1.5,
                      fontWeight: FontWeight.w500,
                      color: Color(0xFFF4EDE2),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildRemarkToggle() {
    final controller = widget.remarkController;
    if (controller == null) return const SizedBox.shrink();
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        final hasRemark = controller.text.trim().isNotEmpty;
        final active = _expanded || hasRemark;
        return GestureDetector(
          onTap: () => setState(() => _expanded = !_expanded),
          behavior: HitTestBehavior.opaque,
          child: Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: active ? const Color(0xFFEFF4FF) : const Color(0xFFF3F4F6),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              Icons.chat_bubble_outline_rounded,
              size: 18,
              color: active ? AppColors.primary : AppColors.textSecondary,
            ),
          ),
        );
      },
    );
  }

  Widget _buildRemarkSection() {
    if (widget.remarkController == null) return const SizedBox.shrink();
    return AnimatedSize(
      duration: const Duration(milliseconds: 180),
      alignment: Alignment.topCenter,
      curve: Curves.easeInOut,
      child: _expanded
          ? Padding(
              padding: const EdgeInsets.only(top: 12),
              child: _LabeledBox(
                title: 'Remark',
                child: TextField(
                  controller: widget.remarkController,
                  minLines: 2,
                  maxLines: 4,
                  maxLength: 100,
                  keyboardType: TextInputType.multiline,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: const InputDecoration(
                    hintText: 'Add a remark (optional)',
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                    filled: false,
                    isDense: true,
                    contentPadding: EdgeInsets.zero,
                    counterText: '',
                  ),
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
            )
          : const SizedBox.shrink(),
    );
  }
}

/// Greyed placeholder shown inside a locked input box when an item is marked
/// Not Available / Not Applicable.
class _LockedDash extends StatelessWidget {
  const _LockedDash();

  @override
  Widget build(BuildContext context) {
    return const Text(
      '—',
      style: TextStyle(
        fontSize: 15,
        fontWeight: FontWeight.w700,
        color: Color(0xFFC4C4C4),
      ),
    );
  }
}

class _PillToggle extends StatelessWidget {
  const _PillToggle({
    required this.label,
    required this.icon,
    required this.selected,
    required this.idleColor,
    required this.idleBg,
    required this.idleBorder,
    required this.activeBg,
    required this.activeBorder,
    required this.activeShadow,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final bool selected;
  final Color idleColor;
  final Color idleBg;
  final Color idleBorder;
  final Color activeBg;
  final Color activeBorder;
  final Color activeShadow;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final Color fg = selected ? Colors.white : idleColor;
    final Color bg = selected ? activeBg : idleBg;
    final Color border = selected ? activeBorder : idleBorder;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(99),
          border: Border.all(color: border),
          boxShadow: selected
              ? [
                  BoxShadow(
                    color: activeShadow,
                    blurRadius: 8,
                    offset: const Offset(0, 2),
                  ),
                ]
              : null,
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: fg, size: 18),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: fg,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _LabeledBox extends StatelessWidget {
  const _LabeledBox({
    required this.title,
    required this.child,
    this.locked = false,
  });

  final String title;
  final Widget child;
  final bool locked;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: AppColors.textSecondary,
            letterSpacing: 0.3,
          ),
        ),
        const SizedBox(height: 6),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          decoration: BoxDecoration(
            color: locked ? const Color(0xFFF7F7F7) : Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: locked ? const Color(0xFFF0F0F0) : const Color(0xFFE5E7EB),
            ),
          ),
          child: Row(
            children: [
              Expanded(child: child),
              if (locked) ...[
                const SizedBox(width: 8),
                const Icon(
                  Icons.lock_outline,
                  size: 16,
                  color: Color(0xFFD1D5DB),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}
