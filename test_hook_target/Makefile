CC = wcl
CFLAGS = -ml -bt=dos -zq -3 -Os -s -fm

TARGET = hook_me.exe
SRCS = hook_me.cpp

all: $(TARGET)

$(TARGET): $(SRCS)
	$(CC) $(CFLAGS) $(SRCS)

.PHONY: clean
clean:
	rm -f *.o *.exe *.map
