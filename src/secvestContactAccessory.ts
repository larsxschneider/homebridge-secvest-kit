import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { request } from 'https';
import { SecvestPlatform } from './platform';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class SecvestContactAccessory {
  private service: Service;

  constructor(
    private readonly platform: SecvestPlatform,
    private readonly accessory: PlatformAccessory,
  ) {

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'ABUS')
      .setCharacteristic(this.platform.Characteristic.Model, 'Öffnungsmelder/Fenstergriffe')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.accessory.context.device.id);

    this.service = this.accessory.getService(this.platform.Service.ContactSensor)
      || this.accessory.addService(this.platform.Service.ContactSensor);
    this.service.setCharacteristic(this.platform.Characteristic.Name, this.accessory.context.device.name);

    const css = this.platform.Characteristic.ContactSensorState;
    const defaultState = css.CONTACT_NOT_DETECTED;
    this.service.setCharacteristic(css, defaultState);

    accessory.context.update = (device) => {
      let newState;
      const now = Date.now();

      if (device.state === 'closed') {
        newState = css.CONTACT_DETECTED;
        this.accessory.context.opened = null;
      } else {
        newState = defaultState;
        if (!this.accessory.context.opened) {
          this.accessory.context.opened = now;
          this.scheduleNotification();
        }
      }

      if (this.accessory.context.opened && this.accessory.context.scheduledNotification) {
        const openSinceMin = Math.round((now - this.accessory.context.opened)/60000);
        const shouldSendNotification = openSinceMin >= this.platform.config.pushover.notificationDelay &&
            now >= this.getScheduledNotification();

        this.platform.log.debug(`${this.accessory.context.device.name} is open for ${openSinceMin} min (notification will be send on ${new Date(this.getScheduledNotification()).toString()})`);

        if (shouldSendNotification) {
          this.sendNotification(`${this.accessory.context.device.name} ist seit ${openSinceMin} Minuten offen.`)
          this.scheduleNotification();
        }
      }

      this.platform.log.debug('set ContactSensorState (' + device.name + '): ' + newState);
      this.service.setCharacteristic(css, newState);
    }
  }

  // NOTIFICATIONS

  isNotificationEnabled() {
    return  this.platform.config.pushover &&
           !this.platform.config.pushover.ignoredZones.includes(this.accessory.context.device.id);
  }

  scheduleNotification() {
    if (this.isNotificationEnabled()) {
      this.accessory.context.scheduledNotification = Date.now() + this.platform.config.pushover.notificationDelay * 60000;
    }
  }

  getScheduledNotification() {
    return this.accessory.context.scheduledNotification;
  }

  sendNotification(message) {
    this.platform.log.info(`send notification: ${message}`);
    const data = JSON.stringify({
       token  : this.platform.config.pushover.token,
       user   : this.platform.config.pushover.user,
       message: message
    });
    const options = {
      method: 'POST',
      hostname: 'api.pushover.net',
      port: 443,
      path: '/1/messages.json',
      headers: {
        'Content-Type'  : 'application/json'
      }
    };
    const req = request(options);
    req.write(data);
    req.end();
  }
}
