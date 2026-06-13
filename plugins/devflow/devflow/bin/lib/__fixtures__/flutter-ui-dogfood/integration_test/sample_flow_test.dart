// Sample integration_test file (used by both mobile flutter test AND web flutter drive per TRD 10-04b)
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:flutter/material.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('sample app launches', (WidgetTester tester) async {
    await tester.pumpWidget(const MaterialApp(home: Center(child: Text('Hello'))));
    expect(find.text('Hello'), findsOneWidget);
  });
}
