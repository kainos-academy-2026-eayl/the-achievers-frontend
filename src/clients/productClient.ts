export class ProductClient {
    constructor(private readonly baseUrl: string) { }

    async getAll(): Promise<unknown> {
        const response = await fetch(new URL("/api/products", this.baseUrl), {
            signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
            throw new Error(`Products request failed with status ${response.status}`);
        }

        return response.json();
    }
}
