import 'dart:async';

import 'package:flutter/material.dart';

import '../data/app_data.dart';
import '../models/models.dart';
import '../services/auth_service.dart';
import '../services/sync_service.dart';
import '../theme/app_button_styles.dart';
import '../theme/app_theme.dart';
import '../utils/date_formatter.dart';
import '../widgets/market_card.dart';
import '../widgets/shop_row.dart' show CollectionStatusStyle;
import 'login_screen.dart';
import 'price_collection_screen.dart';
import 'profile_screen.dart';

class MarketListScreen extends StatefulWidget {
  const MarketListScreen({super.key});

  @override
  State<MarketListScreen> createState() => _MarketListScreenState();
}

class _MarketListScreenState extends State<MarketListScreen> {
  /// Keeps the header date and the "Synced X ago" label from going stale.
  late final Timer _relativeTimeTimer;
  DateTime _now = DateTime.now();
  bool _syncing = false;

  /// Market currently being submitted — only that card shows a spinner.
  int? _submittingMarketId;

  List<Market> get _markets => AppData.markets;

  @override
  void initState() {
    super.initState();
    _relativeTimeTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (!mounted) {
        return;
      }
      setState(() {
        _now = DateTime.now();
      });
    });
  }

  @override
  void dispose() {
    _relativeTimeTimer.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                children: [
                  _buildHeader(),
                  if (AppData.noActiveRound) ...[
                    const SizedBox(height: 12),
                    _buildNoActiveRoundBanner(),
                  ],
                  const SizedBox(height: 16),
                  if (_markets.isNotEmpty && !AppData.noActiveRound) ...[
                    _buildMarketsSectionHeader(),
                    const SizedBox(height: 10),
                  ],
                  if (_markets.isEmpty && !AppData.noActiveRound)
                    _buildEmptyMarketsPanel(),
                  ...List.generate(_markets.length, (marketIndex) {
                    final market = _markets[marketIndex];
                    final submitting = _submittingMarketId == market.marketId;
                    return MarketCard(
                      // Cards now drop out of the list one at a time, so keep
                      // each card's state tied to its market, not its index.
                      key: ValueKey(market.marketId),
                      marketName: market.displayName,
                      description: market.location,
                      reviewRemark: market.reviewRemark,
                      initiallyExpanded: false,
                      collectedShops: market.collectedShops,
                      totalShops: market.shops.length,
                      readyToSubmit: market.isReadyToSubmit,
                      footerNote: _footerNote(market, submitting),
                      footerNoteTone: _footerNoteTone(market, submitting),
                      submitting: submitting,
                      submitEnabled: market.isReadyToSubmit &&
                          !AppData.noActiveRound &&
                          _submittingMarketId == null,
                      onSubmit: () => _onSubmitMarket(market),
                      shops: List.generate(market.shops.length, (shopIndex) {
                        final shop = market.shops[shopIndex];
                        return MarketCardShop(
                          name: '${shop.shopSerialNo}: ${shop.shopName}',
                          status: shop.status,
                          onTap: () =>
                              _openPriceCollection(market, shop, shopIndex),
                        );
                      }),
                    );
                  }),
                  const SizedBox(height: 10),
                ],
              ),
            ),
            _buildBottomButtons(),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GestureDetector(
            onTap: _openProfileScreen,
            child: Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: const Color(0xFFEFF4FF),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(
                Icons.person_rounded,
                color: AppColors.primary,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Material(
                  color: Colors.transparent,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(10),
                    onTap: _openProfileScreen,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 2),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            AppData.surveyor!.name,
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w800,
                              color: AppColors.textPrimary,
                            ),
                          ),
                          const SizedBox(width: 6),
                          const Icon(
                            Icons.arrow_circle_right,
                            size: 16,
                            color: AppColors.primary,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  DateFormatter.formatDate(_now),
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              _lastSyncLabel(),
              textAlign: TextAlign.right,
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: AppColors.textMuted,
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _lastSyncLabel() {
    if (_syncing) return 'Syncing...';
    final lastSync = AppData.lastSyncAt;
    if (lastSync == null) return 'Never synced';
    return 'Synced ${DateFormatter.timeAgo(lastSync, now: _now)}';
  }

  /// "MARKETS · 3" on the left, "1 ready to submit" on the right.
  Widget _buildMarketsSectionHeader() {
    final readyCount = _markets.where((m) => m.isReadyToSubmit).length;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.baseline,
        textBaseline: TextBaseline.alphabetic,
        children: [
          Expanded(
            child: Text(
              'MARKETS · ${_markets.length}',
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.7,
                color: AppColors.textMuted,
              ),
            ),
          ),
          if (readyCount > 0)
            Text(
              '$readyCount ready to submit',
              style: TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.w700,
                color: CollectionStatus.completed.color,
              ),
            ),
        ],
      ),
    );
  }

  // ── Per-market card labels ─────────────────────────────────────────
  //
  // Counted in shops, not items: a market is ready to submit once every one of
  // its shops is fully collected.

  String _footerNote(Market market, bool submitting) {
    if (submitting) return 'Uploading survey data...';
    if (market.isReadyToSubmit) {
      return 'All ${market.shops.length} shops collected';
    }
    final remaining = market.shops.length - market.collectedShops;
    return remaining == 1
        ? '$remaining shop remaining'
        : '$remaining shops remaining';
  }

  Color _footerNoteTone(Market market, bool submitting) {
    if (submitting) return AppColors.primary;
    return market.status.color;
  }

  /// Shown when there are no markets to list.
  ///
  /// An empty list means two different things, and the app must not confuse
  /// them: before the first sync it simply has no data (login navigates here
  /// without syncing), and after a sync the server genuinely returned nothing
  /// still open. Even then /sync can't distinguish "all submitted" from
  /// "nothing assigned", so the wording stays neutral about the cause.
  Widget _buildEmptyMarketsPanel() {
    final neverSynced = AppData.lastSyncAt == null;

    final icon = neverSynced
        ? Icons.cloud_download_outlined
        : Icons.check_circle_outline_rounded;
    final title =
        neverSynced ? 'Sync to load your markets' : 'No markets pending';
    final body = neverSynced
        ? 'Your assigned markets will appear here after you sync.'
        : 'Nothing left to collect right now. Sync to check for new assignments.';

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 48, horizontal: 20),
      alignment: Alignment.center,
      child: Column(
        children: [
          Icon(icon, size: 36, color: AppColors.textMuted),
          const SizedBox(height: 10),
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: AppColors.textSecondary,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            body,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: AppColors.textMuted,
              height: 1.4,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildNoActiveRoundBanner() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF4E5),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFF5C26B)),
      ),
      child: Row(
        children: const [
          Icon(Icons.info_outline_rounded, color: Color(0xFFB54708), size: 20),
          SizedBox(width: 10),
          Expanded(
            child: Text(
              'No active survey round right now. ',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: Color(0xFF93370D),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBottomButtons() {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _syncing ? null : _onSyncPressed,
              icon: _syncing
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.sync_rounded),
              style: AppButtonStyles.syncButton(),
              label: Text(
                _syncing ? 'Syncing...' : 'Sync Survey',
                style:
                    const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _onSyncPressed() async {
    setState(() => _syncing = true);
    try {
      final syncService = await SyncService.getInstance();
      final result = await syncService.syncAndStore();
      if (!mounted) return;
      setState(() => _syncing = false);
      if (result.rejectedCount > 0) {
        _showSnackBar(
          '${result.rejectedCount} '
          '${result.rejectedCount == 1 ? 'entry' : 'entries'} for a closed '
          'round could not be submitted.',
          isError: true,
        );
      } else if (result.outcome == SyncOutcome.noActiveRound) {
        _showSnackBar('No active survey round right now.', isError: false);
      } else {
        _showSnackBar('Survey data synced successfully.', isError: false);
      }
    } on SessionExpiredException {
      if (!mounted) return;
      setState(() => _syncing = false);
      final authService = await AuthService.getInstance();
      await authService.logout();
      if (!mounted) return;
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const LoginScreen()),
        (_) => false,
      );
      _showSnackBar('Session expired. Please log in again.', isError: true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _syncing = false);
      _showSnackBar('Sync failed: $e', isError: true);
    }
  }

  Future<void> _onSubmitMarket(Market market) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Submit Market'),
        content: Text(
          'Submit ${market.displayName}?\n\n'
          "You won't be able to edit its prices until a supervisor returns it.",
        ),
        actions: [
          OutlinedButton(
            onPressed: () => Navigator.pop(ctx, false),
            style: AppButtonStyles.outlineButton(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: AppButtonStyles.submitButton(),
            child: const Text('Submit'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _submittingMarketId = market.marketId);
    final syncService = await SyncService.getInstance();

    // Sync before submit so locally pending entries are pushed and state is
    // fresh — otherwise the backend would finalize stale data. Fatal: if the
    // sync fails, cancel the submission entirely.
    try {
      final result = await syncService.syncAndStore();
      if (result.outcome == SyncOutcome.noActiveRound) {
        if (!mounted) return;
        setState(() => _submittingMarketId = null);
        _showSnackBar(
          'No active survey round right now — nothing to submit.',
          isError: true,
        );
        return;
      }
    } on SessionExpiredException {
      if (!mounted) return;
      setState(() => _submittingMarketId = null);
      final authService = await AuthService.getInstance();
      await authService.logout();
      if (!mounted) return;
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const LoginScreen()),
        (_) => false,
      );
      _showSnackBar('Session expired. Please log in again.', isError: true);
      return;
    } catch (e) {
      if (!mounted) return;
      setState(() => _submittingMarketId = null);
      _showSnackBar(
        'Could not sync — submission cancelled. Please try again: $e',
        isError: true,
      );
      return;
    }

    // The sync above replaced AppData.markets. If this market is gone (a
    // supervisor reassigned it, or it was already submitted elsewhere), don't
    // submit a stale id.
    if (!AppData.markets.any((m) => m.marketId == market.marketId)) {
      if (!mounted) return;
      setState(() => _submittingMarketId = null);
      _showSnackBar(
        '${market.selectedMarket} is no longer open for collection.',
        isError: true,
      );
      return;
    }

    try {
      await syncService.submitRound(marketId: market.marketId);
      // Refresh the list — GET /sync now hides the just-submitted market, so it
      // drops off on its own. Failure here is non-fatal: submission already
      // succeeded and the next manual sync will reconcile.
      try {
        await syncService.syncAndStore();
      } catch (_) {}
      if (!mounted) return;
      setState(() => _submittingMarketId = null);
      _showSnackBar('${market.selectedMarket} submitted.', isError: false);
    } on SessionExpiredException {
      if (!mounted) return;
      setState(() => _submittingMarketId = null);
      final authService = await AuthService.getInstance();
      await authService.logout();
      if (!mounted) return;
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const LoginScreen()),
        (_) => false,
      );
    } on SubmitAlreadySubmittedException {
      if (!mounted) return;
      setState(() => _submittingMarketId = null);
      _showSnackBar(
        '${market.selectedMarket} is already submitted.',
        isError: false,
      );
    } on SubmitMarketNotAssignedException catch (e) {
      if (!mounted) return;
      setState(() => _submittingMarketId = null);
      _showSnackBar(e.toString(), isError: true);
    } on SubmitIncompleteException catch (e) {
      if (!mounted) return;
      setState(() => _submittingMarketId = null);
      _showIncompleteDialog(e);
    } catch (e) {
      if (!mounted) return;
      setState(() => _submittingMarketId = null);
      _showSnackBar('Submission failed: $e', isError: true);
    }
  }

  void _showIncompleteDialog(SubmitIncompleteException e) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Incomplete Survey'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(e.message),
            if (e.missingItems.isNotEmpty) ...[
              const SizedBox(height: 12),
              const Text(
                'Missing items:',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 4),
              ...e.missingItems.map(
                (item) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Text(
                      '• ${item.itemName} (${item.itemCode}) — ${item.reasonLabel}'),
                ),
              ),
            ],
          ],
        ),
        actions: [
          OutlinedButton(
            onPressed: () => Navigator.pop(ctx),
            style: AppButtonStyles.outlineButton(),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  void _showSnackBar(String message, {required bool isError}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? const Color(0xFFB42318) : null,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    );
  }

  Future<void> _openPriceCollection(
      Market market, Shop shop, int shopIndex) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => PriceCollectionScreen(
          market: market,
          shop: shop,
          shopIndex: shopIndex + 1,
          totalShops: market.shops.length,
        ),
      ),
    );
    if (mounted) setState(() {});
  }

  void _openProfileScreen() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => const ProfileScreen(),
      ),
    );
  }
}
