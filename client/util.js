export function parseSDA(mem, addr=0xB20) {
	const view = new DataView(mem.buffer, addr);
	return {
		currentPsp: view.getUint16(0x10, true) * 16,
	}
}

export function parsePSP(mem, addr) {
	const view = new DataView(mem.buffer, addr);
	const decoder = new TextDecoder("ascii");
	return {
		parentPsp: view.getUint16(0x16, true) * 16,
		args: decoder.decode(new Uint8Array(mem, addr + 0x81, view.getUint8(0x80))),
		envBlock: view.getUint16(0x2c, true) * 16,
	}
}

export function parseEnv(mem, addr) {
	const view = new DataView(mem.buffer, addr);
	const result = {
		vars: [],
		executable: ""
	};
	let offset = 0;
	while (true) {
		let str = "";
		while (view.getUint8(offset) !== 0) {
			str += String.fromCharCode(view.getUint8(offset));
			offset++;
		}
		if (str === "") break;
		result.vars.push(str);
		offset++;
	}
	offset++;
	const wordCount = view.getUint16(offset, true); 
	offset += 2;
	let path = "";
	while (view.getUint8(offset) !== 0) {
		path += String.fromCharCode(view.getUint8(offset));
		offset++;
	}
	result.executable = path;
	return result;
}
