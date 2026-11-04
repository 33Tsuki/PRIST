import 'package:flutter/material.dart';

import '../services/auth_service.dart';
import '../theme/app_button_styles.dart';
import '../theme/app_theme.dart';
import 'market_list_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final TextEditingController _passwordController = TextEditingController();

  List<DistrictOption> _districts = [];
  List<SurveyorOption> _surveyors = [];
  DistrictOption? _selectedDistrict;
  SurveyorOption? _selectedSurveyor;

  bool _loadingDistricts = true;
  bool _loadingSurveyors = false;
  bool _loggingIn = false;
  bool _obscurePassword = true;

  @override
  void initState() {
    super.initState();
    _loadDistricts();
  }

  @override
  void dispose() {
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _loadDistricts() async {
    try {
      final authService = await AuthService.getInstance();
      final districts = await authService.listDistricts();
      if (!mounted) return;
      setState(() {
        _districts = districts;
        _loadingDistricts = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loadingDistricts = false);
      _showSnackBar(
        message: 'Failed to load districts. Check your connection.',
        backgroundColor: const Color(0xFFB42318),
      );
    }
  }

  Future<void> _onDistrictChanged(DistrictOption? d) async {
    if (d == null) return;
    setState(() {
      _selectedDistrict = d;
      _selectedSurveyor = null;
      _surveyors = [];
      _loadingSurveyors = true;
    });

    try {
      final authService = await AuthService.getInstance();
      final surveyors = await authService.listSurveyors(d.id);
      if (!mounted) return;
      setState(() {
        _surveyors = surveyors;
        _loadingSurveyors = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loadingSurveyors = false);
      _showSnackBar(
        message: 'Failed to load surveyors for ${d.name}.',
        backgroundColor: const Color(0xFFB42318),
      );
    }
  }

  Future<void> _login() async {
    final surveyor = _selectedSurveyor;
    final password = _passwordController.text;

    if (surveyor == null) {
      _showSnackBar(
        message: 'Please select your district and username',
        backgroundColor: const Color(0xFFB42318),
      );
      return;
    }
    if (password.length < 6) {
      _showSnackBar(
        message: 'Password must be at least 6 characters',
        backgroundColor: const Color(0xFFB42318),
      );
      return;
    }

    setState(() => _loggingIn = true);

    try {
      final authService = await AuthService.getInstance();
      await authService.login(
        username: surveyor.username,
        password: password,
      );

      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const MarketListScreen()),
      );
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() => _loggingIn = false);
      _showSnackBar(
        message: e.message,
        backgroundColor: const Color(0xFFB42318),
      );
    } catch (_) {
      if (!mounted) return;
      setState(() => _loggingIn = false);
      _showSnackBar(
        message: 'Network error. Please check your connection.',
        backgroundColor: const Color(0xFFB42318),
      );
    }
  }

  void _showSnackBar({
    required String message,
    required Color backgroundColor,
  }) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: backgroundColor,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;

    return Scaffold(
      body: Container(
        width: double.infinity,
        height: double.infinity,
        decoration: const BoxDecoration(
          image: DecorationImage(
            image: AssetImage('assets/images/main-bg.png'),
            fit: BoxFit.cover,
          ),
        ),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 28),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    const SizedBox(height: 10),
                    _buildHeader(theme),
                    const SizedBox(height: 26),
                    _buildFormCard(theme),
                    const SizedBox(height: 26),
                    Text(
                      'Need help? Contact Administrator',
                      style: theme.bodyMedium?.copyWith(
                        color: AppColors.textSecondary,
                        fontWeight: FontWeight.w500,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHeader(TextTheme theme) {
    return Column(
      children: [
        Container(
          width: 72,
          height: 72,
          decoration: BoxDecoration(
            color: AppColors.primary,
            borderRadius: BorderRadius.circular(20),
            boxShadow: [
              BoxShadow(
                color: AppColors.primary.withValues(alpha: 0.28),
                blurRadius: 20,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: const Icon(
            Icons.insert_chart_rounded,
            color: Colors.white,
            size: 34,
          ),
        ),
        const SizedBox(height: 18),
        Text(
          'Surveyor Login',
          style: theme.headlineSmall?.copyWith(
            fontWeight: FontWeight.w800,
            color: const Color(0xFF111827),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'CPI Price Collection System',
          style: theme.bodyLarge?.copyWith(
            color: AppColors.textSecondary,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }

  Widget _buildFormCard(TextTheme theme) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFFF3F4F6),
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 24,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _fieldLabel(theme, 'District'),
          const SizedBox(height: 10),
          _districtDropdown(),
          const SizedBox(height: 18),
          _fieldLabel(theme, 'Surveyor'),
          const SizedBox(height: 10),
          _surveyorDropdown(),
          const SizedBox(height: 18),
          _fieldLabel(theme, 'Password'),
          const SizedBox(height: 10),
          _passwordField(),
          const SizedBox(height: 22),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _loggingIn ? null : _login,
              style: AppButtonStyles.submitButton(),
              child: _loggingIn
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: AppButtonStyles.submitForeground,
                      ),
                    )
                  : const Text(
                      'Login',
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 16,
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _fieldLabel(TextTheme theme, String text) {
    return Text(
      text,
      style: theme.labelLarge?.copyWith(
        fontWeight: FontWeight.w700,
        color: const Color(0xFF1F2937),
      ),
    );
  }

  InputDecoration _decoration({String? hint, Widget? prefixIcon}) {
    return InputDecoration(
      filled: true,
      fillColor: Colors.white,
      hintText: hint,
      prefixIcon: prefixIcon,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Color(0xFFD1D5DB)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Color(0xFFD1D5DB)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AppColors.primary, width: 1.4),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
    );
  }

  Widget _districtDropdown() {
    if (_loadingDistricts) {
      return _loadingBox('Loading districts…');
    }
    return DropdownButtonFormField<DistrictOption>(
      initialValue: _selectedDistrict,
      isExpanded: true,
      decoration: _decoration(
        hint: 'Select district',
        prefixIcon: const Icon(Icons.location_on_outlined, size: 20),
      ),
      items: _districts
          .map((d) => DropdownMenuItem(value: d, child: Text(d.label)))
          .toList(),
      onChanged: _loggingIn ? null : _onDistrictChanged,
    );
  }

  Widget _surveyorDropdown() {
    if (_selectedDistrict == null) {
      return _disabledBox('Select a district first');
    }
    if (_loadingSurveyors) {
      return _loadingBox('Loading surveyors…');
    }
    if (_surveyors.isEmpty) {
      return _disabledBox('No surveyors in ${_selectedDistrict!.name}');
    }
    return DropdownButtonFormField<SurveyorOption>(
      initialValue: _selectedSurveyor,
      isExpanded: true,
      decoration: _decoration(
        hint: 'Select your username',
        prefixIcon: const Icon(Icons.person_outline_rounded, size: 20),
      ),
      items: _surveyors
          .map((s) => DropdownMenuItem(value: s, child: Text(s.label)))
          .toList(),
      onChanged:
          _loggingIn ? null : (s) => setState(() => _selectedSurveyor = s),
    );
  }

  Widget _passwordField() {
    return TextField(
      controller: _passwordController,
      obscureText: _obscurePassword,
      textInputAction: TextInputAction.done,
      onSubmitted: (_) => _loggingIn ? null : _login(),
      decoration: _decoration(
        hint: 'Enter password',
        prefixIcon: const Icon(Icons.lock_outline_rounded, size: 20),
      ).copyWith(
        suffixIcon: IconButton(
          icon: Icon(
            _obscurePassword
                ? Icons.visibility_outlined
                : Icons.visibility_off_outlined,
            size: 20,
          ),
          onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
        ),
      ),
    );
  }

  Widget _loadingBox(String label) {
    return Container(
      height: 52,
      padding: const EdgeInsets.symmetric(horizontal: 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFD1D5DB)),
      ),
      alignment: Alignment.centerLeft,
      child: Row(
        children: [
          const SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
          const SizedBox(width: 12),
          Text(
            label,
            style: const TextStyle(color: Color(0xFF6B7280)),
          ),
        ],
      ),
    );
  }

  Widget _disabledBox(String label) {
    return Container(
      height: 52,
      padding: const EdgeInsets.symmetric(horizontal: 14),
      decoration: BoxDecoration(
        color: const Color(0xFFF9FAFB),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      alignment: Alignment.centerLeft,
      child: Text(
        label,
        style: const TextStyle(color: Color(0xFF9CA3AF)),
      ),
    );
  }
}
