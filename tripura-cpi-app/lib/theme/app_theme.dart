import 'package:flutter/material.dart';

import 'app_button_styles.dart';

class AppColors {
  static const Color primary = Color(0xFF356AC3);
  static const Color primaryDark = Color(0xFF264E90);
  static const Color background = Color(0xFFF3F4F6);
  static const Color cardBackground = Colors.white;
  static const Color textPrimary = Color(0xFF1F2937);
  static const Color textSecondary = Color(0xFF6B7280);
  static const Color textMuted = Color(0xFF94A3B8);
  static const Color borderColor = Color(0x1A000000);
  static const Color success = Color(0xFF1C4532);
  static const Color successLight = Color(0xFFB9D9C0);
  static const Color successGreen = Color(0xFF10B981);
  static const Color divider = Color(0x14000000);
  static const Color inputBackground = Color(0xFFF8FAFC);
  static const Color orange = Color(0xFFF57C00);
  static const Color amber = Color(0xFFF1C232);
}

class AppTheme {
  static ThemeData get theme => ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: AppColors.primary,
          primary: AppColors.primary,
          surface: Colors.white,
        ),
        splashFactory: NoSplash.splashFactory,
        highlightColor: Colors.transparent,
        scaffoldBackgroundColor: AppColors.background,
        fontFamily: 'Inter',
        appBarTheme: const AppBarTheme(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          elevation: 0,
          centerTitle: false,
          titleTextStyle: TextStyle(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.2,
          ),
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: AppButtonStyles.submitButton(),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: AppButtonStyles.outlineButton(),
        ),
        textButtonTheme: TextButtonThemeData(
          style: AppButtonStyles.textButton(),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: AppColors.borderColor),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: AppColors.borderColor),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: AppColors.primary, width: 1.4),
          ),
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          hintStyle: const TextStyle(
            color: AppColors.textMuted,
            fontSize: 14,
            fontWeight: FontWeight.w500,
          ),
        ),
      );
}
