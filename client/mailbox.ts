import { Buffer } from "buffer";
import { DOSBoxApi } from "./api"

export interface Message {
	type: number
	data: Buffer
}

export class Mailbox {
	constructor(
		private readonly api: DOSBoxApi,
		private readonly addr: number
	) {
	}

	private readonly unlocked = Buffer.from([0x00]);
	private readonly lockedByClient = Buffer.from([0xFF]);

	private async lock() {
		// TODO: needs some check against multiple clients reading.
		// there's an unused padding byte that could be used
		while (true) {
			const actual = await this.api.compareAndSwap(this.addr, this.lockedByClient, this.unlocked);
			if (actual === null || Buffer.from(actual).equals(this.lockedByClient)) {
				break;
			}
			console.log("lock contention, retrying");
			await new Promise(r => setTimeout(r, 10));
		}
	}

	private async unlock() {
		const actual = await this.api.compareAndSwap(this.addr, this.unlocked, this.lockedByClient);
		if (actual !== null) {
			throw new Error("Mailbox lock not owned by client");
		}
	}

	async forceReset() {
		this.api.writeMem(this.addr, Buffer.from([0x00, 0x00, 0x00, 0x00]));
	}

	async fetch(): Promise<Message[]> {
		// this could probably do optimistic locking:
		// 1. read unlocked (len field is written last, read is atomic)
		// 2. CAS on lock+len
		// 3. if conflict wait for the lock and read the missed message
		// but i don't think this really matters
		await this.lock();
		let payload: Buffer;
		try {
			const HDR_SIZE = 4;
			let data = Buffer.from(await this.api.readMem(this.addr, 4096));
			const payloadLen = data.readUInt16LE(2);
			if (payloadLen + HDR_SIZE > data.length) {
				data = Buffer.from(await this.api.readMem(this.addr, payloadLen + HDR_SIZE));
			};
			await this.api.writeMem(this.addr + 2, Buffer.from([0x00, 0x00]));
			payload = data.slice(HDR_SIZE, payloadLen + HDR_SIZE);
		} finally {
			this.unlock();
		}
		if (payload) {
			const PAYLOAD_HDR_SIZE = 4;
			let result: Message[] = [];
			let i = 0;
			while (i < payload.byteLength) {
				const len = payload.readUInt16LE(i);
				const type = payload.readUInt16LE(i + 2);
				const msg = payload.slice(i + PAYLOAD_HDR_SIZE, i + PAYLOAD_HDR_SIZE + len);
				i = i + len + PAYLOAD_HDR_SIZE;
				result.push({
					type: type,
					data: msg
				})
			}
			return result;
		}
	}

}
