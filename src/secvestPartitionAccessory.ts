import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { SecvestPlatform } from './platform';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class SecvestPartitionAccessory {
  private service: Service;

  constructor(
    private readonly platform: SecvestPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'ABUS')
      .setCharacteristic(this.platform.Characteristic.Model, 'Secvest Partition')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.id);

    this.service = accessory.getService(this.platform.Service.SecuritySystem)
      || accessory.addService(this.platform.Service.SecuritySystem);
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);

    const ssts = this.platform.Characteristic.SecuritySystemTargetState;
    const sscs = this.platform.Characteristic.SecuritySystemCurrentState;
    this.service.setCharacteristic(ssts, ssts.DISARM);
    this.service.setCharacteristic(sscs, sscs.DISARMED);

    this.service.getCharacteristic(this.platform.Characteristic.SecuritySystemTargetState)
      .onSet(async (targetState: CharacteristicValue) => {
        const device = this.accessory.context.device;
        let newState = sscs.DISARMED;

        if (targetState === ssts.STAY_ARM && device.state === 'partset') {
          newState = sscs.STAY_ARM;
        } else if (targetState === ssts.AWAY_ARM && device.state === 'set') {
          newState = sscs.AWAY_ARM;
        }

        this.platform.log.debug('set SecuritySystemCurrentState (' + this.accessory.context.device.name + '):' +
          ' target(' + targetState + '), device (' + device.state + '), new(' + newState + ')');
        this.service.setCharacteristic(sscs, newState);
      });

    accessory.context.update = (device) => {
      let newState = ssts.DISARM;

      if (device.state === 'partset') {
        newState = ssts.STAY_ARM;
      } else if (device.state === 'set') {
        newState = ssts.AWAY_ARM;
      }

      this.platform.log.debug('set SecuritySystemTargetState (' + device.name + '): ' + newState);
      this.service.setCharacteristic(ssts, newState);
    };
  }
}
