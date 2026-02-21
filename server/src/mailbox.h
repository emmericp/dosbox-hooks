#pragma once

#include <stdint.h>

typedef enum {
	MAILBOX_TYPE_RAW_HEX = 0xFF00,
	MAILBOX_TYPE_DEBUG,
	MAILBOX_TYPE_INFO,
	MAILBOX_TYPE_WARN,
	MAILBOX_TYPE_ERROR, 
} mailbox_type_t;

void mailbox_send(uint16_t type, void* data, uint16_t len);
void mailbox_sendf(mailbox_type_t type, const char* format, ...);
