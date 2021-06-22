import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { SecvestPlatform } from './platform';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class SecvestLockAccessory {
  private service: Service;

  constructor(
    private readonly platform: SecvestPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'ABUS')
      .setCharacteristic(this.platform.Characteristic.Model, 'Riegelschaltkontakt')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.id);

    this.service = accessory.getService(this.platform.Service.LockMechanism)
      || accessory.addService(this.platform.Service.LockMechanism);
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);

    const lts = this.platform.Characteristic.LockTargetState;
    const lcs = this.platform.Characteristic.LockCurrentState;
    this.service.setCharacteristic(lts, lts.UNSECURED);
    this.service.setCharacteristic(lcs, lcs.UNKNOWN);

    this.service.getCharacteristic(this.platform.Characteristic.LockTargetState)
      .onSet(async (targetState: CharacteristicValue) => {
        const device = this.accessory.context.device;
        let newState = lcs.UNKNOWN;

        if (targetState === lts.SECURED && device.state === 'closed') {
          newState = lcs.SECURED;
        } else if (targetState === lts.UNSECURED && device.state === 'open') {
          newState = lcs.UNSECURED;
        }

        this.platform.log.debug('set LockCurrentState (' + this.accessory.context.device.name + '): target(' + targetState + '), device (' + device.state + '), new(' + newState + ')');
        this.service.setCharacteristic(lcs, newState);
      });

    accessory.context.update = (device) => {
      let newState = lts.UNSECURED;
      if (device.state === 'closed') {
        newState = lts.SECURED;
      }

      this.platform.log.debug(`set LockTargetState (${device.name}): ${newState}`);
      this.service.setCharacteristic(lts, newState);
    };
  }
}
