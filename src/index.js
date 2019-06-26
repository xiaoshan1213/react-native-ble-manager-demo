import React, { Component } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  FlatList,
  Platform,
  TextInput,
  Alert,
  Button,
  PermissionsAndroid
} from "react-native";
import BleModule from "./BleModule";
import { bytesToString } from "convert-string";
import RRNFileSelector from "react-native-file-selector";
import RNFetchBlob from "react-native-fetch-blob";

//make sure there is one one manager instance
global.BluetoothManager = new BleModule();

export default class App extends Component {
  constructor(props) {
    super(props);
    this.state = {
      data: [],
      scaning: false,
      isConnected: false,
      text: "",
      writeData: "",
      receiveData: "",
      readData: "",
      isMonitoring: false
    };
    this.bluetoothReceiveData = []; //received data buffer
    this.deviceMap = new Map();
  }

  componentDidMount() {
    BluetoothManager.start(); //ble initiate
    this.updateStateListener = BluetoothManager.addListener(
      "BleManagerDidUpdateState",
      this.handleUpdateState
    );
    this.stopScanListener = BluetoothManager.addListener(
      "BleManagerStopScan",
      this.handleStopScan
    );
    this.discoverPeripheralListener = BluetoothManager.addListener(
      "BleManagerDiscoverPeripheral",
      this.handleDiscoverPeripheral
    );
    this.connectPeripheralListener = BluetoothManager.addListener(
      "BleManagerConnectPeripheral",
      this.handleConnectPeripheral
    );
    this.disconnectPeripheralListener = BluetoothManager.addListener(
      "BleManagerDisconnectPeripheral",
      this.handleDisconnectPeripheral
    );
    this.updateValueListener = BluetoothManager.addListener(
      "BleManagerDidUpdateValueForCharacteristic",
      this.handleUpdateValue
    );
  }

  componentWillUnmount() {
    this.updateStateListener.remove();
    this.stopScanListener.remove();
    this.discoverPeripheralListener.remove();
    this.connectPeripheralListener.remove();
    this.disconnectPeripheralListener.remove();
    this.updateValueListener.remove();
    if (this.state.isConnected) {
      BluetoothManager.disconnect(); //
    }
  }

  //ble state change
  handleUpdateState = args => {
    console.log("BleManagerDidUpdateStatea:", args);
    BluetoothManager.bluetoothState = args.state;
    if (args.state == "on") {
      //scan when open
      this.scan();
    }
  };

  //stop scan
  handleStopScan = () => {
    console.log("BleManagerStopScan:", "Scanning is stopped");
    this.setState({ scaning: false });
  };

  //handle device when scanned
  handleDiscoverPeripheral = data => {
    // console.log('BleManagerDiscoverPeripheral:', data);
    console.log(data.id, data.name);
    // if(data.name !== 'mymac'){
    //     return;
    // }
    // BluetoothManager.stopScan();
    // this.setState({ scaning: false });
    let id; //蓝牙连接id
    let macAddress; //蓝牙Mac地址
    if (Platform.OS == "android") {
      macAddress = data.id;
      id = macAddress;
    } else {
      //ios连接时不需要用到Mac地址，但跨平台识别同一设备时需要Mac地址
      //如果广播携带有Mac地址，ios可通过广播0x18获取蓝牙Mac地址，
      macAddress = BluetoothManager.getMacAddressFromIOS(data);
      id = data.id;
    }
    this.deviceMap.set(data.id, data); //使用Map类型保存搜索到的蓝牙设备，确保列表不显示重复的设备
    this.setState({ data: [...this.deviceMap.values()] });
  };

  //device connected
  handleConnectPeripheral = args => {
    console.log("BleManagerConnectPeripheral:", args);
  };

  //device disconnected
  handleDisconnectPeripheral = args => {
    console.log("BleManagerDisconnectPeripheral:", args);
    let newData = [...this.deviceMap.values()];
    BluetoothManager.initUUID(); //clean UUID when disconnect
    this.setState({
      data: newData,
      isConnected: false,
      writeData: "",
      readData: "",
      receiveData: "",
      text: ""
    });
  };

  //receive new data
  handleUpdateValue = data => {
    //ios接收到的是小写的16进制，android接收的是大写的16进制，统一转化为大写16进制
    var dataString = bytesToString(data.value);
    Alert.alert(dataString, dataString, [
      {
        text: "cancel",
        onPress: () => {}
      }
    ]);
    // let value = data.value.toUpperCase();
    this.bluetoothReceiveData.push(dataString);
    console.log("BluetoothUpdateValue", dataString);
    this.setState({ receiveData: this.bluetoothReceiveData.join("") });
  };

  connect(item) {
    //当前蓝牙正在连接时不能打开另一个连接进程
    if (BluetoothManager.isConnecting) {
      console.log("当前蓝牙正在连接时不能打开另一个连接进程");
      return;
    }
    if (this.state.scaning) {
      //当前正在扫描中，连接时关闭扫描
      BluetoothManager.stopScan();
      this.setState({ scaning: false });
    }
    let newData = [...this.deviceMap.values()];
    newData[item.index].isConnecting = true;
    this.setState({ data: newData });
    console.log("connected device is: " + item.item);
    BluetoothManager.connect(item.item.id)
      .then(peripheralInfo => {
        let newData = [...this.state.data];
        newData[item.index].isConnecting = false;
        //连接成功，列表只显示已连接的设备
        this.setState({
          data: [item.item],
          isConnected: true
        });
      })
      .catch(err => {
        let newData = [...this.state.data];
        newData[item.index].isConnecting = false;
        this.setState({ data: newData });
        this.alert("connect fail");
      });
  }

  disconnect() {
    this.setState({
      data: [...this.deviceMap.values()],
      isConnected: false
    });
    BluetoothManager.disconnect();
  }

  scan() {
    if (this.state.scaning) {
      //当前正在扫描中
      BluetoothManager.stopScan();
      this.setState({ scaning: false });
    }
    if (BluetoothManager.bluetoothState == "on") {
      BluetoothManager.scan()
        .then(() => {
          this.setState({ scaning: true });
        })
        .catch(err => {});
    } else {
      BluetoothManager.checkState();
      if (Platform.OS == "ios") {
        this.alert("请开启手机蓝牙");
      } else {
        Alert.alert("提示", "请开启手机蓝牙", [
          {
            text: "取消",
            onPress: () => {}
          },
          {
            text: "打开",
            onPress: () => {
              BluetoothManager.enableBluetooth();
            }
          }
        ]);
      }
    }
  }

  alert(text) {
    Alert.alert("提示", text, [{ text: "确定", onPress: () => {} }]);
  }

  write = index => {
    if (this.state.text.length == 0) {
      this.alert("please write" + index);
      return;
    }
    BluetoothManager.write(this.state.text, index)
      .then(() => {
        this.bluetoothReceiveData = [];
        this.setState({
          writeData: this.state.text,
          text: ""
        });
      })
      .catch(err => {
        this.alert("send fail");
      });
  };

  writeWithoutResponse = index => {
    if (this.state.text.length == 0) {
      this.alert("type here");
      return;
    }
    BluetoothManager.writeWithoutResponse(this.state.text, index)
      .then(() => {
        this.bluetoothReceiveData = [];
        this.setState({
          writeData: this.state.text,
          text: ""
        });
      })
      .catch(err => {
        this.alert("send fail");
      });
  };

  read = index => {
    BluetoothManager.read(index)
      .then(data => {
        this.setState({ readData: data });
      })
      .catch(err => {
        this.alert("read fail");
      });
  };

  notify = index => {
    BluetoothManager.startNotification(index)
      .then(() => {
        this.setState({ isMonitoring: true });
        this.alert("subscribe success");
      })
      .catch(err => {
        this.setState({ isMonitoring: false });
        this.alert("subscribe fail");
      });
  };

  renderItem = item => {
    let data = item.item;
    console.log("name is: ", data.name, " localname is: ", data.advertising.localName);
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        disabled={this.state.isConnected ? true : false}
        onPress={() => {
          this.connect(item);
        }}
        style={styles.item}
      >
        <View style={{ flexDirection: "row" }}>
          <Text style={{ color: "black" }}>{data.advertising.localName ? data.advertising.localName : (data.name ? data.name : "")}</Text>
          <Text style={{ marginLeft: 50, color: "red" }}>
            {data.isConnecting ? "connecting..." : ""}
          </Text>
        </View>
        <Text>{data.id}</Text>
      </TouchableOpacity>
    );
  };

  renderHeader = () => {
    return (
      <View style={{ marginTop: 20 }}>
        <TouchableOpacity
          activeOpacity={0.7}
          style={[
            styles.buttonView,
            { marginHorizontal: 10, height: 40, alignItems: "center" }
          ]}
          onPress={
            this.state.isConnected
              ? this.disconnect.bind(this)
              : this.scan.bind(this)
          }
        >
          <Text style={styles.buttonText}>
            {this.state.scaning
              ? "searching"
              : this.state.isConnected
              ? "disconnect"
              : "search"}
          </Text>
        </TouchableOpacity>

        <Text style={{ marginLeft: 10, marginTop: 10 }}>
          {this.state.isConnected ? "connected device" : "available devices"}
        </Text>
      </View>
    );
  };


  renderFooter = () => {
    return (
      <View style={{ marginBottom: 30 }}>
        {this.state.isConnected ? (
          <View>
            {this.renderWriteView(
                "write：",
                "send",
                BluetoothManager.writeWithResponseCharacteristicUUID,
                this.write,
                this.state.writeData
            )}
            {this.renderWriteView(
                "write (writeWithoutResponse)：",
                "send",
                BluetoothManager.writeWithoutResponseCharacteristicUUID,
                this.writeWithoutResponse,
                this.state.writeData
            )}
            {this.renderReceiveView(
              "data read：",
              "read",
              BluetoothManager.readCharacteristicUUID,
              this.read,
              this.state.readData
            )}

            {this.renderReceiveView(
              "data subscribed：" +
                `${this.state.isMonitoring ? "subscribed" : "not subscribed"}`,
              "start subscribe",
              BluetoothManager.nofityCharacteristicUUID,
              this.notify,
              this.state.receiveData
            )}
          </View>
        ) : (
          <View />
        )}
      </View>
    );
  };

  renderReceiveView = (label, buttonText, characteristics, onPress, state) => {
    if (characteristics.length == 0) {
      return;
    }
    return (
      <View style={{ marginHorizontal: 10, marginTop: 30 }}>
        <Text style={{ color: "black", marginTop: 5 }}>{label}</Text>
        <Text style={styles.content}>{state}</Text>
        {characteristics.map((item, index) => {
          return (
            <TouchableOpacity
              activeOpacity={0.7}
              style={styles.buttonView}
              onPress={() => {
                onPress(index);
              }}
              key={index}
            >
              <Text style={styles.buttonText}>
                {buttonText} ({item})
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  renderWriteView = (label, buttonText, characteristics, onPress, state) => {
    if (characteristics.length == 0) {
      return;
    }
    return (
      <View style={{ marginHorizontal: 10, marginTop: 30 }} behavior="padding">
        <Text style={{ color: "black" }}>{label}</Text>
        <Text style={styles.content}>{this.state.writeData}</Text>
        {characteristics.map((item, index) => {
          return (
            <TouchableOpacity
              key={index}
              activeOpacity={0.7}
              style={styles.buttonView}
              onPress={() => {
                onPress(index);
              }}
            >
              <Text style={styles.buttonText}>
                {buttonText} ({item})
              </Text>
            </TouchableOpacity>
          );
        })}
        <TextInput
          style={[styles.textInput]}
          value={this.state.text}
          placeholder="请输入消息"
          onChangeText={text => {
            this.setState({ text: text });
          }}
        />
        <Button title="select file" onPress={this.selectFile} />
        <Button title="write file" onPress={this.writeFile} />
      </View>
    );
  };

  writeFile = async () => {
    try {
        if(Platform.OS == "android"){
            const granted = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
                {
                title: "write Permission",
                message: "write permision " + "so you can write to external",
                buttonNeutral: "Ask Me Later",
                buttonNegative: "Cancel",
                buttonPositive: "OK"
                }
            );
        
            if (granted === PermissionsAndroid.RESULTS.GRANTED) {
                RNFetchBlob.fs
                .createFile("/storage/emulated/0/Download/test.txt", "test12345", "utf8")
                .then(() => {
                    this.alert("success");
                })
                .catch(err => {
                    this.alert("create fail");
                });
            }   
        }else{
            console.log("create file at: ", RNFetchBlob.fs.dirs.DocumentDir);
            RNFetchBlob.fs
            .createFile(RNFetchBlob.fs.dirs.DocumentDir+"/test.txt", "test12345", "utf8")
            .then(() => {
            this.alert("success");
            })
            .catch(err => {
            this.alert("create fail");
            });
      }

    } catch (e) {
      this.alert("write fail");
    }
  };

  readFile = async () => {
    try {
        if(Platform.OS == 'android'){
            const granted = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
                {
                  title: "read Permission",
                  message: "read permision " + "so you can read to external",
                  buttonNeutral: "Ask Me Later",
                  buttonNegative: "Cancel",
                  buttonPositive: "OK"
                }
              );
              if (granted === PermissionsAndroid.RESULTS.GRANTED) {
                RNFetchBlob.fs
                  .readFile("/storage/emulated/0/Download/test.txt", "utf8")
                  .then(data => {
                    this.alert("read data: " + data);
                    BluetoothManager.write(data, 0)
                      .then(() => {
                        this.alert("send success");
                      })
                      .catch(err => {
                        this.alert("send fail");
                      });
                  })
                  .catch(err => {
                    this.alert("read fail");
                  });
              }
        }else{
            //ios
        }

    } catch (e) {
      this.alert("fail");
    }
  };

  selectFile = () => {
    RRNFileSelector.Show({
      title: "Select",
      onDone: path => {
        console.log("file selected: " + path);
        this.alert(path);
        var dir = RNFetchBlob.fs.dirs.DocumentDir;
        if(Platform.OS == 'ios'){
            path = dir + '/certificates-deeplens_ikuiPocbQXijNGV0JDS8pg.zip';
        }
        RNFetchBlob.fs
          .readFile(path, 'base64')
          .then(data => {
            console.log("get the data: ", data);
            // this.alert(data);
            BluetoothManager.write(data, 0)
              .then(() => {
                console.log("send success");
              })
              .catch(err => {
                console.log("send fail");
              });
          })
          .catch(err => {
            console.log("read file fail");
          });
      },
      onCancel: () => {
        console.log("cancelled");
      }
    });
  };

  render() {
    return (
      <View style={styles.container}>
        <FlatList
          renderItem={this.renderItem}
          ListHeaderComponent={this.renderHeader}
          ListFooterComponent={this.renderFooter}
          keyExtractor={item => item.id}
          data={this.state.data}
          extraData={[
            this.state.isConnected,
            this.state.text,
            this.state.receiveData,
            this.state.readData,
            this.state.writeData,
            this.state.isMonitoring,
            this.state.scaning
          ]}
          keyboardShouldPersistTaps="handled"
        />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "white",
    marginTop: Platform.OS == "ios" ? 20 : 0
  },
  item: {
    flexDirection: "column",
    borderColor: "rgb(235,235,235)",
    borderStyle: "solid",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingLeft: 10,
    paddingVertical: 8
  },
  buttonView: {
    height: 30,
    backgroundColor: "rgb(33, 150, 243)",
    paddingHorizontal: 10,
    borderRadius: 5,
    justifyContent: "center",
    alignItems: "center",
    alignItems: "flex-start",
    marginTop: 10
  },
  buttonText: {
    color: "white",
    fontSize: 12
  },
  content: {
    marginTop: 5,
    marginBottom: 15
  },
  textInput: {
    paddingLeft: 5,
    paddingRight: 5,
    backgroundColor: "white",
    height: 50,
    fontSize: 16,
    flex: 1
  }
});
