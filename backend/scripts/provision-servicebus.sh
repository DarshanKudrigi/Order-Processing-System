#!/usr/bin/env bash
set -euo pipefail

# Provision Azure Service Bus Topic and Subscriptions with SQL filters as defined in PRD Section 7.2 & 11.2
RG=${1:-rg-orderapp-dev}
LOC=${2:-centralindia}
NS=${3:-sb-orderapp-${RANDOM}}
TOPIC="order-events"

echo "Provisioning Service Bus in resource group: $RG, location: $LOC, namespace: $NS"

az group create -n "$RG" -l "$LOC"
az servicebus namespace create -g "$RG" -n "$NS" --sku Standard -l "$LOC"
az servicebus topic create -g "$RG" --namespace-name "$NS" -n "$TOPIC" --default-message-time-to-live P1D

# Create subscriptions with peek-lock, max-delivery-count 5, lock-duration PT1M, dead-lettering on expiry
SUBS=("inventory-sub" "payment-sub" "shipping-sub" "notification-sub" "status-sub")

for S in "${SUBS[@]}"; do
    echo "Creating subscription $S..."
    az servicebus topic subscription create \
        -g "$RG" \
        --namespace-name "$NS" \
        --topic-name "$TOPIC" \
        -n "$S" \
        --max-delivery-count 5 \
        --lock-duration PT1M \
        --dead-lettering-on-message-expiration true

    # Delete $Default rule
    az servicebus topic subscription rule delete \
        -g "$RG" \
        --namespace-name "$NS" \
        --topic-name "$TOPIC" \
        --subscription-name "$S" \
        -n '$Default' || true
done

# Add SQL filters as per Section 7.2
echo "Adding SQL filter rules..."

az servicebus topic subscription rule create \
    -g "$RG" \
    --namespace-name "$NS" \
    --topic-name "$TOPIC" \
    --subscription-name "inventory-sub" \
    -n "filterInventory" \
    --filter-sql-expression "eventType IN ('OrderCreated','OrderCancelled','PaymentFailed')"

az servicebus topic subscription rule create \
    -g "$RG" \
    --namespace-name "$NS" \
    --topic-name "$TOPIC" \
    --subscription-name "payment-sub" \
    -n "filterPayment" \
    --filter-sql-expression "eventType = 'StockReserved'"

az servicebus topic subscription rule create \
    -g "$RG" \
    --namespace-name "$NS" \
    --topic-name "$TOPIC" \
    --subscription-name "shipping-sub" \
    -n "filterShipping" \
    --filter-sql-expression "eventType = 'PaymentCompleted'"

az servicebus topic subscription rule create \
    -g "$RG" \
    --namespace-name "$NS" \
    --topic-name "$TOPIC" \
    --subscription-name "notification-sub" \
    -n "filterNotification" \
    --filter-sql-expression "eventType IN ('OrderCreated','StockReservationFailed','PaymentCompleted','PaymentFailed','ShipmentCreated','OrderCancelled')"

az servicebus topic subscription rule create \
    -g "$RG" \
    --namespace-name "$NS" \
    --topic-name "$TOPIC" \
    --subscription-name "status-sub" \
    -n "filterStatus" \
    --filter-sql-expression "eventType IN ('StockReserved','StockReservationFailed','PaymentCompleted','PaymentFailed','ShipmentCreated')"

echo "Service Bus topic and 5 subscriptions provisioned successfully!"

