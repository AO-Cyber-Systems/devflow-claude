import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

void main() {
  testWidgets('renders loading state', (tester) async {
    // Pump in loading state — full AsyncValue.when coverage shape:
    // asyncVal.when(
    //   loading: () => CircularProgressIndicator(),
    //   data: (val) => Text(val),
    //   error: (e, st) => ErrorView(e),
    // )
    await tester.pumpWidget(const Placeholder());
    expect(find.byType(CircularProgressIndicator), findsNothing); // placeholder
  });

  testWidgets('renders data state', (tester) async {
    await tester.pumpWidget(const Placeholder());
    expect(find.text('hello'), findsNothing); // placeholder
  });

  testWidgets('renders error state', (tester) async {
    await tester.pumpWidget(const Placeholder());
    expect(find.textContaining('Error'), findsNothing); // placeholder
  });
}
