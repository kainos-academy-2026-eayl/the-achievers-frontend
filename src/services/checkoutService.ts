import type { Profile } from "../clients/profileClient";
import type { ShippingAddressInput } from "../clients/orderClient";

type CheckoutBody = Record<string, unknown>;
type SavedAddress = ShippingAddressInput & { id: string; label: string };

const DEMO_CARD_NUMBER = "4242424242424242";
const DEMO_CARD_EXPIRY = "12/34";
const DEMO_CARD_CVC = "123";

function readString(body: CheckoutBody, key: string): string {
	return typeof body[key] === "string" ? (body[key] as string).trim() : "";
}

function addressFromProfile(
	address: {
		addressLine1: string | null;
		addressLine2: string | null;
		city: string | null;
		postcode: string | null;
	} | null,
): ShippingAddressInput | undefined {
	if (!address) return undefined;
	return {
		addressLine1: address.addressLine1 ?? "",
		addressLine2: address.addressLine2 ?? "",
		city: address.city ?? "",
		postcode: address.postcode ?? "",
	};
}

function isCompleteAddress(
	address: ShippingAddressInput | undefined,
): address is ShippingAddressInput {
	return Boolean(
		address?.addressLine1.trim() &&
			address.city.trim() &&
			address.postcode.trim(),
	);
}

export class CheckoutService {
	getSavedAddresses(profile: Profile): SavedAddress[] {
		const candidates = [
			{ id: "home", label: "Home address", address: profile.homeAddress },
			...profile.otherAddresses.map((address, index) => ({
				id: `other-${index}`,
				label: address.label?.trim() || `Other address ${index + 1}`,
				address,
			})),
		];
		return candidates.flatMap(({ id, label, address }) => {
			const values = addressFromProfile(address);
			return values && isCompleteAddress(values)
				? [{ id, label, ...values }]
				: [];
		});
	}

	addressFromForm(body: CheckoutBody): ShippingAddressInput {
		return {
			addressLine1: readString(body, "differentAddressLine1"),
			addressLine2: readString(body, "differentAddressLine2"),
			city: readString(body, "differentCity"),
			postcode: readString(body, "differentPostcode"),
		};
	}

	getSavedAddress(
		profile: Profile,
		selectedAddressId: string,
	): ShippingAddressInput | undefined {
		const selected = this.getSavedAddresses(profile).find(
			(address) => address.id === selectedAddressId,
		);
		if (!selected) return undefined;
		const { id: _id, label: _label, ...address } = selected;
		return address;
	}

	validateForm(
		body: CheckoutBody,
		useDifferentAddress: boolean,
		address: ShippingAddressInput,
	): Record<string, string> {
		const errors: Record<string, string> = {};
		if (
			readString(body, "cardNumber").replace(/\s/g, "") !== DEMO_CARD_NUMBER ||
			readString(body, "cardExpiry") !== DEMO_CARD_EXPIRY ||
			readString(body, "cardCvc") !== DEMO_CARD_CVC
		) {
			errors.cardDetails = "Enter the demo card details shown above.";
		}
		if (useDifferentAddress) {
			if (!address.addressLine1) errors.addressLine1 = "Enter address line 1.";
			if (!address.city) errors.city = "Enter a town or city.";
			if (!address.postcode) errors.postcode = "Enter a postcode.";
		}
		return errors;
	}
}
