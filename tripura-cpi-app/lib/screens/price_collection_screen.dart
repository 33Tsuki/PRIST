import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

import '../data/app_data.dart';
import '../models/models.dart';
import '../models/price_record.dart';
import '../services/price_record_dao.dart';
import '../services/substitute_shop_service.dart';
import '../services/sync_service.dart';
import '../theme/app_button_styles.dart';
import '../theme/app_theme.dart';
import '../utils/price_validation.dart';
import '../widgets/item_card.dart';

class PriceCollectionScreen extends StatefulWidget {
  const PriceCollectionScreen({
    super.key,
    required this.market,
    required this.shop,
    this.shopIndex,
    this.totalShops,
  });

  final Market market;
  final Shop shop;
  final int? shopIndex;
  final int? totalShops;

  @override
  State<PriceCollectionScreen> createState() => _PriceCollectionScreenState();
}

class _PriceCollectionScreenState extends State<PriceCollectionScreen> {
  late List<ShopItem> _items;
  final Map<int, TextEditingController> _controllers = {};
  final Map<int, TextEditingController> _lastMonthControllers = {};
  final Map<int, TextEditingController> _remarkControllers = {};
  final Set<int> _naItemIds = <int>{};
  final Set<int> _napItemIds = <int>{};

  bool _showAllItems = false;
  int _currentItemIndex = 0;

  @override
  void initState() {
    super.initState();
    _items = List<ShopItem>.from(widget.shop.items);

    for (final item in _items) {
      _controllers[item.itemPriceCollectionShopSetupId] = TextEditingController(
        text: item.currentPrice?.toStringAsFixed(2) ?? '',
      );
      _remarkControllers[item.itemPriceCollectionShopSetupId] =
          TextEditingController(text: item.remark ?? '');
      if (item.previousPeriodPrice == null) {
        _lastMonthControllers[item.itemPriceCollectionShopSetupId] =
            TextEditingController(
          text: item.storedPreviousPeriodPrice?.toStringAsFixed(2) ?? '',
        );
      }
      if (item.isNa) {
        _naItemIds.add(item.itemPriceCollectionShopSetupId);
      }
      if (item.isNotApplicable) {
        _napItemIds.add(item.itemPriceCollectionShopSetupId);
      }
    }

    _loadDbRecords();
    SharedPreferences.getInstance().then((p) => setState(() {
          _showAllItems = p.getBool('show_all_items') ?? false;
        }));
  }

  Future<void> _loadDbRecords() async {
    final userId = AppData.surveyor?.id;
    final roundId = AppData.surveyRound?.roundId;
    if (userId == null || roundId == null) return;

    final dao = await PriceRecordDao.getInstance();
    for (final item in _items) {
      final record =
          await dao.getRecordForItem(userId, roundId, item.marketItemId);
      if (record == null) continue;

      final key = item.itemPriceCollectionShopSetupId;

      // Remark is independent of N/A — populate it either way.
      final remarkCtrl = _remarkControllers[key];
      if (remarkCtrl != null &&
          remarkCtrl.text.trim().isEmpty &&
          record.remark != null) {
        remarkCtrl.text = record.remark!;
      }

      if (record.isNa) {
        _naItemIds.add(key);
        _controllers[key]?.clear();
        _lastMonthControllers[key]?.clear();
      } else if (record.isNotApplicable) {
        _napItemIds.add(key);
        _controllers[key]?.clear();
        _lastMonthControllers[key]?.clear();
      } else {
        if (record.currentPeriodPrice != null) {
          final ctrl = _controllers[key];
          if (ctrl != null && ctrl.text.trim().isEmpty) {
            ctrl.text = record.currentPeriodPrice!.toStringAsFixed(2);
          }
        }
        if (record.previousPeriodPrice != null) {
          final lastCtrl = _lastMonthControllers[key];
          if (lastCtrl != null) {
            lastCtrl.text = record.previousPeriodPrice!.toStringAsFixed(2);
          }
        }
      }
    }
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    for (final controller in _controllers.values) {
      controller.dispose();
    }
    for (final controller in _lastMonthControllers.values) {
      controller.dispose();
    }
    for (final controller in _remarkControllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  int get _displayTotalItems => _items.length;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildHeader(),
                    const SizedBox(height: 16),
                    _buildShopInfoCard(),
                    const SizedBox(height: 16),
                    _buildPriceListSection(),
                    const SizedBox(height: 14),
                    _buildItemView(),
                  ],
                ),
              ),
            ),
            _buildBottomActions(),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        IconButton.filledTonal(
          onPressed: () => Navigator.of(context).pop(),
          icon: const Icon(Icons.arrow_back_rounded),
          style: IconButton.styleFrom(
            backgroundColor: const Color(0xFFEFF4FF),
            foregroundColor: AppColors.primary,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Enter item prices',
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Shop ${widget.shopIndex ?? 1} of ${widget.totalShops ?? 1} · $_displayTotalItems items',
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textSecondary,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildShopInfoCard() {
    final shopLabel = widget.shop.shopSerialNo;
    final shopName = widget.shop.shopName;

    return Container(
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
      child: Column(
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: const BoxDecoration(
              color: Color(0xFFB9D9C0),
              borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'Shop $shopLabel: $shopName',
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: Color(0xFF1C4532),
                    ),
                  ),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.8),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    'In progress · $_filledDisplayCount / $_displayTotalItems items filled',
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF1C4532),
                    ),
                  ),
                ),
              ],
            ),
          ),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Text(
              widget.shop.shopDescriptionAndLocation,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: Color(0xFF4B5563),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPriceListSection() {
    final progress = _displayTotalItems == 0
        ? 0.0
        : _filledDisplayCount / _displayTotalItems;
    final remainingLabel = _unfilledRemainingCount == 1
        ? '1 unfilled item remaining'
        : '$_unfilledRemainingCount unfilled items remaining';

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 16,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Price list',
            style: TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w800,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Enter current month prices or mark items not available / not applicable.',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: AppColors.textSecondary,
            ),
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(100),
            child: LinearProgressIndicator(
              value: progress.clamp(0.0, 1.0),
              minHeight: 10,
              backgroundColor: const Color(0xFFE5E7EB),
              color: AppColors.primary,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            '$_filledDisplayCount of $_displayTotalItems items filled',
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: Color(0xFF4B5563),
            ),
          ),
          const SizedBox(height: 14),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: const Color(0xFFF9FCF9),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFFBFD7BF)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Show All Items',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: AppColors.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        remainingLabel,
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: AppColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                Switch(
                  value: _showAllItems,
                  onChanged: (value) {
                    setState(() {
                      _showAllItems = value;
                    });
                    SharedPreferences.getInstance()
                        .then((p) => p.setBool('show_all_items', value));
                  },
                  activeThumbColor: AppColors.primary,
                  activeTrackColor: const Color(0xFFBFD7BF),
                  inactiveThumbColor: const Color(0xFFD1D5DB),
                  inactiveTrackColor: const Color(0xFFE5E7EB),
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildItemView() {
    if (_showAllItems) {
      return Column(
        children: List.generate(_items.length, (index) {
          final item = _items[index];
          final key = item.itemPriceCollectionShopSetupId;
          final controller = _controllers[key]!;
          return Padding(
            padding:
                EdgeInsets.only(bottom: index == _items.length - 1 ? 0 : 14),
            child: ItemCard(
              key: ValueKey(key),
              itemCode: item.itemCode,
              itemName: item.itemName,
              description: () {
                final parts = <String>[];
                if (item.marketItemDescription?.trim().isNotEmpty ?? false) {
                  parts.add(item.marketItemDescription!.trim());
                }
                if (item.productSpecification.trim().isNotEmpty) {
                  parts.add(item.productSpecification.trim());
                }
                return parts.isNotEmpty
                    ? parts.join('\n')
                    : 'Specification not available in sheet';
              }(),
              lastMonthPrice: item.previousPeriodPrice,
              lastMonthController: _lastMonthControllers[key],
              monthController: controller,
              remarkController: _remarkControllers[key],
              isNa: _naItemIds.contains(key),
              onNaChanged: (value) => _toggleNa(key, value),
              isNotApplicable: _napItemIds.contains(key),
              onNotApplicableChanged: (value) =>
                  _toggleNotApplicable(key, value),
              onThisMonthChanged: (_) => _onItemChanged(key),
              canMarkNa: true,
              canMarkNotApplicable: !item.isForwarded,
              unitOfSale: item.unitOfSale,
              dsRemark: item.dsRemark,
            ),
          );
        }),
      );
    }

    if (_items.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(32),
          child: Text('No items assigned to this shop.'),
        ),
      );
    }

    final currentItem = _items[_currentItemIndex];
    final key = currentItem.itemPriceCollectionShopSetupId;
    final activeController = _controllers[key]!;
    return ItemCard(
      key: ValueKey(key),
      itemCode: currentItem.itemCode,
      itemName: currentItem.itemName,
      description: () {
        final parts = <String>[];
        if (currentItem.marketItemDescription?.trim().isNotEmpty ?? false) {
          parts.add(currentItem.marketItemDescription!.trim());
        }
        if (currentItem.productSpecification.trim().isNotEmpty) {
          parts.add(currentItem.productSpecification.trim());
        }
        return parts.isNotEmpty
            ? parts.join('\n')
            : 'Specification not available in sheet';
      }(),
      lastMonthPrice: currentItem.previousPeriodPrice,
      lastMonthController: _lastMonthControllers[key],
      monthController: activeController,
      remarkController: _remarkControllers[key],
      isNa: _naItemIds.contains(key),
      onNaChanged: (value) => _toggleNa(key, value),
      isNotApplicable: _napItemIds.contains(key),
      onNotApplicableChanged: (value) => _toggleNotApplicable(key, value),
      onThisMonthChanged: (_) => _onItemChanged(key),
      canMarkNa: SubstituteShopService.resolveSubstitute(currentItem) != null,
      canMarkNotApplicable: !currentItem.isForwarded,
      unitOfSale: currentItem.unitOfSale,
      dsRemark: currentItem.dsRemark,
    );
  }

  Widget _buildBottomActions() {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (!_showAllItems && _items.isNotEmpty) ...[
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _currentItemIndex == 0
                        ? null
                        : () {
                            setState(() {
                              _currentItemIndex -= 1;
                            });
                          },
                    icon: const Icon(Icons.chevron_left_rounded),
                    label: const Text('Previous item'),
                    style: AppButtonStyles.outlineButton(),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: _currentItemIndex == _items.length - 1
                        ? null
                        : () {
                            setState(() {
                              _currentItemIndex += 1;
                            });
                          },
                    icon: const Icon(Icons.chevron_right_rounded),
                    label: const Text('Next item'),
                    style: AppButtonStyles.submitButton(),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
          ],
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _saveAndExit,
              style: AppButtonStyles.submitButton(),
              child: const Text(
                'Save',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _saveAndExit() async {
    final userId = AppData.surveyor?.id;
    final roundId = AppData.surveyRound?.roundId;

    // Update in-memory prices
    for (final item in _items) {
      final key = item.itemPriceCollectionShopSetupId;

      // Persist user-entered last month price to model for cache
      final lastMonthCtrl = _lastMonthControllers[key];
      if (lastMonthCtrl != null && lastMonthCtrl.text.trim().isNotEmpty) {
        item.storedPreviousPeriodPrice =
            double.tryParse(lastMonthCtrl.text.trim());
      } else if (lastMonthCtrl != null) {
        item.storedPreviousPeriodPrice = null;
      }

      // Keep the remark in-memory/cache even when there's no price or N/A.
      // (The DB loop below only attaches it to a record when one is created.)
      final remarkCtrl = _remarkControllers[key];
      final remarkText = remarkCtrl?.text.trim() ?? '';
      item.remark = remarkText.isNotEmpty ? remarkText : null;

      if (_naItemIds.contains(key)) {
        item.isNa = true;
        item.isNotApplicable = false;
        item.isCollected = true;
        item.currentPrice = null;
      } else if (_napItemIds.contains(key)) {
        item.isNa = false;
        item.isNotApplicable = true;
        item.isCollected = true;
        item.currentPrice = null;
      } else {
        item.isNa = false;
        item.isNotApplicable = false;
        final currentCtrl = _controllers[key];
        if (currentCtrl != null && currentCtrl.text.trim().isNotEmpty) {
          item.currentPrice = double.tryParse(currentCtrl.text.trim());
          item.isCollected = true;
        } else {
          item.currentPrice = null;
          item.isCollected = false;
        }
      }
    }

    // Local typo surety check: warn (non-blocking) before persisting when a
    // price looks like a data-entry typo versus the previous period.
    final flagged = _items
        .where((item) =>
            !item.isNa &&
            !item.isNotApplicable &&
            isPriceLikelyTypo(
              item.currentPrice,
              item.previousPeriodPrice ?? item.storedPreviousPeriodPrice,
            ))
        .toList();

    if (flagged.isNotEmpty) {
      final proceed = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Double-check these prices'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'These prices changed a lot from last month and may be typos:',
              ),
              const SizedBox(height: 12),
              ...flagged.map((item) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Text(
                    '${item.itemName}: ₹*** → ₹${item.currentPrice!.toStringAsFixed(2)}',
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                );
              }),
            ],
          ),
          actions: [
            OutlinedButton(
              onPressed: () => Navigator.pop(ctx, false),
              style: AppButtonStyles.outlineButton(),
              child: const Text('Review'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              style: AppButtonStyles.submitButton(),
              child: const Text('Save anyway'),
            ),
          ],
        ),
      );
      if (proceed != true || !mounted) return;
    }

    // Remove forwarded items for items no longer marked NA
    for (final item in _items) {
      if (item.isNa) continue;
      await SubstituteShopService.removeForwardedItems(
          widget.market, item, userId, roundId);
    }

    // Forward NA items to substitute shops
    for (final item in _items) {
      if (!item.isNa) continue;
      final resolved = SubstituteShopService.resolveSubstitute(item);
      if (resolved == null) continue;
      final (substitute, remaining) = resolved;
      SubstituteShopService.addItemToSubstituteShop(
          widget.market, item, substitute, remaining);
    }

    // Persist updated market structure to cache
    final syncService = await SyncService.getInstance();
    await syncService.updateCache();

    // Persist to DB
    if (userId != null && roundId != null) {
      final dao = await PriceRecordDao.getInstance();
      final now = DateTime.now().toIso8601String();
      final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
      const uuid = Uuid();

      for (final item in _items) {
        final key = item.itemPriceCollectionShopSetupId;
        final hasPrice = item.currentPrice != null;
        final isNa = _naItemIds.contains(key);
        final isNap = _napItemIds.contains(key);

        final lastMonthCtrl = _lastMonthControllers[key];
        final userEnteredPreviousPrice =
            lastMonthCtrl != null && lastMonthCtrl.text.trim().isNotEmpty;

        final existing =
            await dao.getRecordForItem(userId, roundId, item.marketItemId);

        // Handle items with no user-entered data
        if (!hasPrice && !userEnteredPreviousPrice && !isNa && !isNap) {
          if (existing == null) {
            continue; // Never interacted, nothing to do
          }
          if (existing.syncStatus != SyncStatus.synced) {
            await dao.deleteRecord(existing.clientId);
            continue; // Was pending, never reached backend
          }
          // Was synced -- backend has stale data (e.g. is_na: true),
          // fall through to upsert with the flags cleared
        }

        // For surviving records, include API previousPrice in sync payload
        final previousPrice = (isNa || isNap)
            ? null
            : (userEnteredPreviousPrice
                ? double.tryParse(lastMonthCtrl.text.trim())
                : (item.previousPeriodPrice ?? item.storedPreviousPeriodPrice));

        final clientId = existing?.clientId ?? uuid.v4();

        final record = PriceRecord(
          clientId: clientId,
          userId: userId,
          roundId: roundId,
          marketItemId: item.marketItemId,
          itemPriceCollectionShopSetupId: item.itemPriceCollectionShopSetupId,
          previousPeriodPrice: previousPrice,
          currentPeriodPrice: item.currentPrice,
          isNa: isNa,
          isNotApplicable: isNap,
          remark: item.remark,
          priceRecordingDate: today,
          syncStatus: SyncStatus.pending,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        );
        await dao.upsertRecord(record);
      }
    }

    if (!mounted) return;
    Navigator.of(context).pop();
  }

  void _toggleNa(int itemKey, bool isNa) {
    setState(() {
      if (isNa) {
        _naItemIds.add(itemKey);
        _napItemIds.remove(itemKey); // mutually exclusive
        _controllers[itemKey]?.clear();
        _lastMonthControllers[itemKey]?.clear();
      } else {
        _naItemIds.remove(itemKey);
      }
    });
  }

  void _toggleNotApplicable(int itemKey, bool isNap) {
    setState(() {
      if (isNap) {
        _napItemIds.add(itemKey);
        _naItemIds.remove(itemKey); // mutually exclusive
        _controllers[itemKey]?.clear();
        _lastMonthControllers[itemKey]?.clear();
      } else {
        _napItemIds.remove(itemKey);
      }
    });
  }

  void _onItemChanged(int itemKey) {
    if (_naItemIds.contains(itemKey) || _napItemIds.contains(itemKey)) {
      setState(() {
        _naItemIds.remove(itemKey);
        _napItemIds.remove(itemKey);
      });
      return;
    }

    setState(() {});
  }

  bool _isItemFilled(ShopItem item) {
    final key = item.itemPriceCollectionShopSetupId;
    if (_naItemIds.contains(key)) return true;
    if (_napItemIds.contains(key)) return true;
    final currentCtrl = _controllers[key];
    if (currentCtrl == null || currentCtrl.text.trim().isEmpty) return false;
    return true;
  }

  int get _filledDisplayCount {
    final count = _items.where(_isItemFilled).length;
    return count > _displayTotalItems ? _displayTotalItems : count;
  }

  int get _actualFilledCount => _items.where(_isItemFilled).length;

  int get _unfilledRemainingCount {
    final remaining = _items.length - _actualFilledCount;
    return remaining < 0 ? 0 : remaining;
  }
}
