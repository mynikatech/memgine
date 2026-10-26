import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";

export type RedemptionProductChoice = {
  productId: string;
  productName: string;
  productCode?: string | null;
};

export type RedemptionItemChoice = {
  itemType: "BENEFIT" | "OFFER";
  itemId: string;
  label: string;
};

export type RedemptionProductSelectionState = {
  selections: Record<string, string>;
  ready: boolean;
};

export const productChoiceKey = (item: RedemptionItemChoice) =>
  `${item.itemType}:${item.itemId}`;

export function RedemptionProductPicker({
  subscriptionId,
  items,
  loadChoices,
  onChange,
}: {
  subscriptionId: string;
  items: RedemptionItemChoice[];
  loadChoices: (
    item: RedemptionItemChoice,
  ) => Promise<RedemptionProductChoice[]>;
  onChange: (state: RedemptionProductSelectionState) => void;
}) {
  const [options, setOptions] = useState<
    Record<string, RedemptionProductChoice[]>
  >({});

  const [selections, setSelections] = useState<Record<string, string>>({});

  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const latestLoad = useRef(loadChoices);
  const latestChange = useRef(onChange);

  latestLoad.current = loadChoices;
  latestChange.current = onChange;

  const signature = items.map(productChoiceKey).join("|");

  useEffect(() => {
    let live = true;
    const wanted = items.map((item) => ({ ...item }));

    setPending(true);
    setFailure(null);

    latestChange.current({
      selections: {},
      ready: false,
    });

    Promise.all(wanted.map((item) => latestLoad.current(item)))
      .then((lists) => {
        if (!live) return;

        const nextOptions: Record<string, RedemptionProductChoice[]> = {};

        const nextSelections: Record<string, string> = {};

        wanted.forEach((item, index) => {
          const key = productChoiceKey(item);
          const choices = lists[index];

          nextOptions[key] = choices;

          if (choices.length === 1) {
            nextSelections[key] = choices[0].productId;
          }
        });

        setOptions(nextOptions);
        setSelections(nextSelections);
        setPending(false);

        latestChange.current({
          selections: nextSelections,
          ready:
            wanted.length > 0 &&
            wanted.every((item) => !!nextSelections[productChoiceKey(item)]),
        });
      })
      .catch((error) => {
        if (!live) return;

        setFailure(
          error instanceof Error
            ? error.message
            : "Product choices are unavailable",
        );

        setOptions({});
        setSelections({});
        setPending(false);

        latestChange.current({
          selections: {},
          ready: false,
        });
      });

    return () => {
      live = false;
    };
  }, [signature, subscriptionId]);

  const choose = (key: string, productId: string) => {
    const next = {
      ...selections,
      [key]: productId,
    };

    setSelections(next);

    latestChange.current({
      selections: next,
      ready:
        items.length > 0 &&
        items.every((item) => !!next[productChoiceKey(item)]),
    });
  };

  if (items.length === 0) return null;

  return (
    <View style={{ gap: 10, paddingVertical: 10 }}>
      <Text style={{ fontSize: 16, fontWeight: "600" }}>
        Choose products to redeem
      </Text>

      {pending ? <Text>Loading eligible products…</Text> : null}

      {failure ? <Text style={{ color: "#b91c1c" }}>{failure}</Text> : null}

      {!pending && !failure
        ? items.map((item) => {
            const key = productChoiceKey(item);
            const choices = options[key] ?? [];

            return (
              <View key={key} style={{ gap: 6 }}>
                <Text style={{ fontWeight: "600" }}>{item.label}</Text>

                {choices.length === 0 ? (
                  <Text>No eligible products for this item.</Text>
                ) : null}

                {choices.map((choice) => {
                  const selected = selections[key] === choice.productId;

                  return (
                    <Pressable
                      key={choice.productId}
                      accessibilityRole="radio"
                      accessibilityState={{
                        checked: selected,
                      }}
                      onPress={() => choose(key, choice.productId)}
                      style={{
                        borderWidth: selected ? 2 : 1,
                        borderColor: selected ? "#2563eb" : "#9ca3af",
                        borderRadius: 8,
                        padding: 10,
                      }}
                    >
                      <Text>
                        {selected ? "◉" : "○"} {choice.productName}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            );
          })
        : null}
    </View>
  );
}
