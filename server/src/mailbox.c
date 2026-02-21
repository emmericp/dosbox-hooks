#include <stdarg.h>
#include <stdint.h>
#include <stdatomic.h>

#include "printf/printf.h"

#include "mailbox.h"
#include "mutex.h"

typedef struct {
	_Atomic uint8_t mutex;
	_Atomic uint16_t len;
	uint8_t data[];
} mailbox_t;

typedef struct {
	uint16_t len;
	uint16_t type;
	uint8_t data[];
} mailbox_entry_t;

__attribute__((section(".inject")))
mailbox_t* mailbox = 0;

__attribute__((section(".inject")))
uint32_t mailbox_size = 0;

typedef struct {
	_Atomic uint32_t sent;
	_Atomic uint32_t dropped_overflow;
	_Atomic uint32_t lock_contentions;
} mailbox_stats_t;

mailbox_stats_t mailbox_stats;

void mailbox_send(uint16_t type, void* data, uint16_t len) {
	// Avoid mutex contention if it's full anyways
	if (atomic_load(&mailbox->len) + len > mailbox_size - sizeof(mailbox_t) - sizeof(mailbox_entry_t)) {
		mailbox_stats.dropped_overflow++;
		return;
	}
	acquire_lock(&mailbox->mutex, &mailbox_stats.lock_contentions);
	if (mailbox->len + len > mailbox_size - sizeof(mailbox_t) - sizeof(mailbox_entry_t)) {
		mailbox->mutex = 0;
		mailbox_stats.dropped_overflow++;
		return;
	}
	mailbox_entry_t* entry = (mailbox_entry_t*)(&mailbox->data[mailbox->len]);
	entry->type = type;
	entry->len = len;
	for (uint16_t i = 0; i < len; ++i) {
		entry->data[i] = *((uint8_t*)data + i);
	}
	mailbox->len += len + sizeof(mailbox_entry_t);
	mailbox_stats.sent++;
	mailbox->mutex = 0;
}

// This does not need to be reentrant and our stack is of unknown size.
static char buf[256];

void mailbox_sendf(mailbox_type_t type, const char* format, ...) {
	va_list args;
  	va_start(args, format);
	int cnt = vsnprintf_(buf, sizeof(buf), format, args);
	va_end(args);
	if (cnt >= 0) {
		uint32_t len = (uint32_t) cnt;
		len = len > sizeof(buf) ? sizeof(buf) : len;
		mailbox_send(type, buf, cnt);
	}
}
