// Used to represent raw devices being passed around within a process
// Not network transparent!
import { SkyDevice } from "../../types.ts";

export class DeviceEntry {
  Type = "Device" as const;
  constructor(
    public Name: string,
    device: SkyDevice,
  ) {
    Object.defineProperty(this, '_device', {
      value: device,
    });
  }
  _device!: SkyDevice;

  getEntry(path: string) {
    return this._device.getEntry(path);
  }

  inspect() {
    return `<Device ${JSON.stringify(this.Name)} impl=${this._device.constructor.name}>`;
  }
}
