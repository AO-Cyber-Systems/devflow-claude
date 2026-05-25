// Fixture: Partial Riverpod coverage — data-only via .whenData()
// Coverage: data branch ONLY (via whenData). loading + error are NOT covered.
// This fixture must NOT match the `when_all_three` regex (which requires loading:, data:, error: all present).
// It SHOULD match `when_data_only` (covers: [data], confidence: HIGH).

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('renders data state only via whenData', (tester) async {
    final asyncVal = AsyncValue.data('hello');

    // Only the data branch is handled — loading and error are ignored.
    asyncVal.whenData((val) => Text(val));

    await tester.pumpWidget(
      ProviderScope(
        overrides: [],
        child: MaterialApp(home: Scaffold(body: Container())),
      ),
    );
    await tester.pump();
  });
}
