import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { SecvestPlatform } from './platform';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class SecvestWaterAccessory {
  private service: Service;

  constructor(
    private readonly platform: SecvestPlatform,
    private readonly accessory: PlatformAccessory,
  ) {

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'ABUS')
      .setCharacteristic(this.platform.Characteristic.Model, 'Wassermelder')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.id);

    this.service = this.accessory.getService(this.platform.Service.LeakSensor)
      || this.accessory.addService(this.platform.Service.LeakSensor);
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);

    const sd = this.platform.Characteristic.LeakDetected;
    const defaultState = sd.LEAK_NOT_DETECTED;
    this.service.setCharacteristic(sd, defaultState);

    accessory.context.update = (device) => {
      let newState = defaultState;

      if (device.state === 'open') {
        newState = sd.LEAK_DETECTED;
      }

      this.platform.log.debug('set LeakDetected (' + device.name + '): ' + newState);
      this.service.setCharacteristic(sd, newState);
    }
  }
}
