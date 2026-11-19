import sys
from datetime import timedelta
from pathlib import Path

# Ensure backend root is on Python path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from azure.core.exceptions import HttpResponseError, ResourceExistsError, ResourceNotFoundError
from azure.servicebus.management import ServiceBusAdministrationClient, SqlRuleFilter

from src.config.env import settings

SUBSCRIPTIONS = {
    "inventory-sub": {
        "rule_name": "filterInventory",
        "sql": "eventType IN ('OrderCreated','OrderCancelled','PaymentFailed')",
        "description": "Stock reservation and compensation rollback",
    },
    "payment-sub": {
        "rule_name": "filterPayment",
        "sql": "eventType = 'StockReserved'",
        "description": "Payment authorization and settlement",
    },
    "shipping-sub": {
        "rule_name": "filterShipping",
        "sql": "eventType = 'PaymentCompleted'",
        "description": "Carrier tracking generation and dispatch",
    },
    "notification-sub": {
        "rule_name": "filterNotification",
        "sql": "eventType IN ('OrderCreated','StockReservationFailed','PaymentCompleted','PaymentFailed','ShipmentCreated','OrderCancelled')",
        "description": "Customer email notifications (non-blocking)",
    },
    "status-sub": {
        "rule_name": "filterStatus",
        "sql": "eventType IN ('StockReserved','StockReservationFailed','PaymentCompleted','PaymentFailed','ShipmentCreated')",
        "description": "Order saga forward status updates (inside API)",
    },
}


def main():
    conn_str = settings.SERVICEBUS_CONNECTION_STRING
    topic_name = settings.SB_TOPIC_NAME or "order-events"

    if not conn_str:
        print("❌ ERROR: SERVICEBUS_CONNECTION_STRING is not set in backend/.env")
        sys.exit(1)

    print("==================================================================")
    print("⚡ Azure Service Bus Setup & Verification Tool")
    print("==================================================================")
    print(f"Target Topic: {topic_name}")
    print("Connecting using ServiceBusAdministrationClient...")

    try:
        admin_client = ServiceBusAdministrationClient.from_connection_string(conn_str)
    except Exception as exc:
        print(f"❌ Failed to parse Service Bus connection string: {exc}")
        sys.exit(1)

    # 1. Ensure Topic Exists
    try:
        try:
            topic = admin_client.get_topic(topic_name)
            print(f"✅ Topic '{topic_name}' exists (Status: {topic.status})")
        except ResourceNotFoundError:
            print(f"⚙️  Topic '{topic_name}' not found. Creating topic...")
            admin_client.create_topic(
                topic_name=topic_name,
                default_message_time_to_live=timedelta(days=1),
            )
            print(f"✅ Topic '{topic_name}' created successfully!")
    except HttpResponseError as exc:
        if "Unauthorized" in str(exc) or "401" in str(exc) or "Forbidden" in str(exc) or "403" in str(exc):
            print(f"⚠️  Access Notice: Connection string has no 'Manage' permission ({exc.message}).")
            print("   Please ensure the topic and subscriptions exist in your Azure Portal:")
            print(f"   - Topic: {topic_name}")
            for sub, conf in SUBSCRIPTIONS.items():
                print(f"   - Subscription: {sub} | SQL: {conf['sql']}")
            return
        else:
            print(f"❌ Topic check error: {exc}")
            raise

    # 2. Ensure Subscriptions and Rules Exist
    for sub_name, conf in SUBSCRIPTIONS.items():
        print(f"\n--- Checking subscription: {sub_name} ({conf['description']}) ---")
        try:
            try:
                admin_client.get_subscription(topic_name, sub_name)
                print(f"  ✅ Subscription '{sub_name}' already exists.")
            except ResourceNotFoundError:
                print(f"  ⚙️  Creating subscription '{sub_name}'...")
                admin_client.create_subscription(
                    topic_name=topic_name,
                    subscription_name=sub_name,
                    max_delivery_count=5,
                    lock_duration=timedelta(minutes=1),
                    dead_lettering_on_message_expiration=True,
                )
                print(f"  ✅ Subscription '{sub_name}' created.")

            # Check rules on the subscription
            existing_rules = {rule.name: rule for rule in admin_client.list_rules(topic_name, sub_name)}

            # Remove $Default (1=1 TrueFilter) if present so messages are properly filtered
            if "$Default" in existing_rules:
                try:
                    admin_client.delete_rule(topic_name, sub_name, "$Default")
                    print(f"  🧹 Removed default catch-all rule '$Default' from '{sub_name}'.")
                except Exception as del_err:
                    print(f"  ⚠️ Could not remove '$Default' rule: {del_err}")

            rule_name = conf["rule_name"]
            sql_expr = conf["sql"]

            if rule_name not in existing_rules:
                print(f"  ⚙️  Adding SQL rule '{rule_name}' [ {sql_expr} ]...")
                admin_client.create_rule(
                    topic_name=topic_name,
                    subscription_name=sub_name,
                    rule_name=rule_name,
                    filter=SqlRuleFilter(sql_expression=sql_expr),
                )
                print(f"  ✅ Rule '{rule_name}' created successfully.")
            else:
                print(f"  ✅ Rule '{rule_name}' is already active.")

        except Exception as sub_err:
            print(f"  ❌ Error provisioning subscription '{sub_name}': {sub_err}")

    print("\n==================================================================")
    print("🎉 Azure Service Bus verification complete!")
    print("==================================================================")


if __name__ == "__main__":
    main()
