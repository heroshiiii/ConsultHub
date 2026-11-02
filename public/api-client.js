const api = {
    async request(path, options = {}) {
        const response = await fetch(`/api/${path}`, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...options.headers
            }
        });
        if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            throw new Error(result.error || `Request failed (${response.status}).`);
        }
        return response.status === 204 ? null : response.json();
    },
    get(path) {
        return this.request(path);
    },
    create(path, data) {
        return this.request(path, { method: "POST", body: JSON.stringify(data) });
    },
    update(path, data) {
        return this.request(path, { method: "PATCH", body: JSON.stringify(data) });
    },
    replace(path, data) {
        return this.request(path, { method: "PUT", body: JSON.stringify(data) });
    },
    remove(path) {
        return this.request(path, { method: "DELETE" });
    }
};
