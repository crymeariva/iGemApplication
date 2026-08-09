import smbus
import time
import argparse
# THIS IS NOW DEPRECATED AND WILL NOT BE FURTHER UPDATED
# USE THE EXPRESS SERVER INSTEAD FOR COMMUNICATION WITH THE ARDUINO
# THIS WILL BE LEFT IN PLACE FOR REFERENCE AND TESTING PURPOSES, BUT THE EXPRESS SERVER IS NOW THE PRIMARY MEANS OF COMMUNICATION WITH THE ARDUINO

def ConvertStringToBytes(src):
    return [ord(b) for b in src]

#Assuming only 3-4 Addresses for now
ARDUINO_1_ADDRESS = 0x04 #Currently going single Addresss route
#ARDUINO_2_ADDRESS = 0x05
#ARDUINO_3_ADDRESS = 0x06
TCA_ADDRESS = 0x70
CHANNEL = 2
SlaveAddress = 0x04
I2Cbus = smbus.SMBus(1)

parser = argparse.ArgumentParser(description="Axis movement controller")
# Example Command
# python3 i2cTest.py Y down 6000
parser.add_argument(
    "axis",
    choices=["X", "Y", "Z", "A"],
    help="Which Axis (X, Y, Z, A)"
)

parser.add_argument(
    "direction",
    choices=["up", "down"],
    help="Movement direction (up/down)"
)

parser.add_argument(
    "distance",
    help="How far (~6000 full syringe)"
)

args = parser.parse_args()

aSelect = args.axis.strip()
bSelect = args.direction.lower().strip()
valSelect = str(args.distance).strip()

BytesToSend = ConvertStringToBytes(f"{aSelect} {bSelect} {valSelect}")

print(BytesToSend)

#Left side of the chip may be badly sautered lmao
try:
    I2Cbus.write_byte(TCA_ADDRESS, 1 << CHANNEL) # Set the multiplexer to the correct channel
    I2Cbus.write_i2c_block_data(SlaveAddress, 0x00, BytesToSend)
    print(f"Sent {bSelect} to Arduino {aSelect} at address {hex(SlaveAddress)}")

except:
    print("invalid i2c location")
