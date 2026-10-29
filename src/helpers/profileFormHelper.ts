import type {
	AddressInput,
	FieldErrors,
	Profile,
} from "../clients/profileClient";

export type FormValues = Record<string, string>;

const PERSONAL_FIELDS = ["name", "email", "phone"] as const;
const ADDRESS_FIELDS = [
	"label",
	"addressLine1",
	"addressLine2",
	"city",
	"postcode",
] as const;
// Form prefix for each address slot, and the matching backend error prefix.
const ADDRESS_SLOTS = [
	{ form: "home", api: "homeAddress" },
	{ form: "other0", api: "otherAddresses.0" },
	{ form: "other1", api: "otherAddresses.1" },
] as const;

export class ProfileFormHelper {
	profileToForm(profile: Profile): FormValues {
		const values: FormValues = {
			name: profile.name,
			email: profile.email,
			phone: profile.phone ?? "",
		};
		const addresses = [profile.homeAddress, ...profile.otherAddresses];
		ADDRESS_SLOTS.forEach((slot, index) => {
			for (const field of ADDRESS_FIELDS) {
				values[`${slot.form}-${field}`] = addresses[index]?.[field] ?? "";
			}
		});
		return values;
	}

	bodyToForm(body: Record<string, unknown>): FormValues {
		const read = (key: string) =>
			typeof body[key] === "string" ? (body[key] as string) : "";
		const values: FormValues = {};
		for (const field of PERSONAL_FIELDS) values[field] = read(field);
		for (const slot of ADDRESS_SLOTS) {
			for (const field of ADDRESS_FIELDS) {
				const key = `${slot.form}-${field}`;
				values[key] = read(key);
			}
		}
		return values;
	}

	formToAddress(values: FormValues, slot: string): AddressInput {
		return {
			...(slot === "home" ? {} : { label: values[`${slot}-label`] ?? "" }),
			addressLine1: values[`${slot}-addressLine1`] ?? "",
			addressLine2: values[`${slot}-addressLine2`] ?? "",
			city: values[`${slot}-city`] ?? "",
			postcode: values[`${slot}-postcode`] ?? "",
		};
	}

	toFormErrors(fieldErrors: FieldErrors): FieldErrors {
		const errors: FieldErrors = {};
		for (const [key, message] of Object.entries(fieldErrors)) {
			const slot = ADDRESS_SLOTS.find(({ api }) => key.startsWith(`${api}.`));
			errors[slot ? `${slot.form}-${key.slice(slot.api.length + 1)}` : key] =
				message;
		}
		return errors;
	}

	accountSummary(user: { name: string; email: string; createdAt: string }) {
		const joined = new Date(user.createdAt);
		return {
			name: user.name,
			email: user.email,
			memberSince: Number.isNaN(joined.getTime())
				? ""
				: joined.toLocaleDateString("en-GB", {
						month: "long",
						year: "numeric",
					}),
		};
	}
}
